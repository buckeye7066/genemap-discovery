import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import { SCIENTIFIC_HONESTY_DIRECTIVE } from '../services/scientificHonesty.js';
import { LLM_FAILURE_ACTION, FAILURE_LESSON_THRESHOLD } from '../services/agentMesh.js';

// Same mocking style as llm.test.js: stub the LLM service so no provider call
// is ever made, but capture exactly what the route handed it.
vi.mock('../services/llm.js', () => ({
  generateExplanation: vi.fn(async () => 'EXPLANATION'),
  generateChatResponse: vi.fn(async () => 'CHAT'),
  generateImage: vi.fn(async () => ({ url: 'https://img/ok' })),
}));

let app;
let prisma;
let llmService;
let llmRoute;
// Snapshot of every model method so a test that swaps one out for a throwing
// stub cannot leak that stub into the next test (prisma._reset() only clears
// the in-memory rows, not the methods).
let pristineModels;
// The model name this route actually asks for — derived, never hard-coded, so
// an env override cannot silently make these assertions vacuous.
let MODEL;

const COOKIE = () => authCookie({ userId: 'mesh-user', email: 'mesh@example.com', role: 'user' });

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false, includeLlm: true });
  llmService = await import('../services/llm.js');
  llmRoute = await import('../routes/llm.js');
  MODEL = llmRoute.__test.effectiveModel({});
  pristineModels = new Map(
    Object.entries(prisma)
      .filter(([, value]) => value && typeof value === 'object' && typeof value.findMany === 'function')
      .map(([key, value]) => [key, { ...value }])
  );
});

afterAll(async () => app.close());

beforeEach(async () => {
  prisma._reset();
  for (const [key, methods] of pristineModels) Object.assign(prisma[key], methods);
  vi.clearAllMocks();
  llmService.generateExplanation.mockImplementation(async () => 'EXPLANATION');
  llmService.generateChatResponse.mockImplementation(async () => 'CHAT');
  prisma.learningSession.count = vi.fn(async () => 0);
  prisma.licenseAssignment.findFirst = vi.fn(async () => null);
  prisma._store.user.push({
    id: 'mesh-user',
    email: 'mesh@example.com',
    role: 'user',
    banned: false,
    subscriptions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await llmRoute.__test.flushMeshWork();
});

/** Seed a lesson authored by `author` so the OTHER agent can learn it. */
function seedLesson(author, claim) {
  const lesson = {
    id: `lesson-${claim}`,
    authorAgent: author,
    topic: 'provider_reliability',
    claim,
    evidence: null,
    timesSeen: 1,
    consumedBy: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  prisma._store.agentLesson.push(lesson);
  return lesson;
}

function seedMessage(from, to, body) {
  const message = {
    id: `msg-${body}`,
    fromAgent: from,
    toAgent: to,
    kind: 'provider_reliability',
    body,
    metadata: null,
    readBy: {},
    createdAt: new Date(),
  };
  prisma._store.agentMessage.push(message);
  return message;
}

const RESEARCH_TASK_INPUT = Object.freeze({
  version: 1,
  cohort: { sampleCount: 50, classification: 'deidentified_aggregate', hasControls: true },
  modalities: ['wes'],
  objective: 'identify_variants',
  focus: {
    kind: 'curated_concept',
    conceptId: 'phenotype:early-onset-symptoms',
    canonicalLabel: 'early-onset symptoms',
    conceptKind: 'phenotype',
    source: 'genemap_curated',
    version: 1,
  },
});

// Legacy tests used distinct raw prompts only as call labels. The public route
// no longer accepts those prompts, so every mesh invocation now exercises the
// same safe server-composed research contract.
const invoke = ({ prompt: _label, ...payload } = {}) =>
  app.inject({
    method: 'POST',
    url: '/llm/invoke',
    headers: { cookie: COOKIE() },
    payload: {
      publicationTask: 'aggregate_genomics_research',
      taskInput: RESEARCH_TASK_INPUT,
      ...payload,
    },
  });
const chat = (payload) =>
  app.inject({ method: 'POST', url: '/llm/chat', headers: { cookie: COOKIE() }, payload });

// ─── Run start: peer note injection ──────────────────────────────────────────

describe('/llm/invoke peer-note injection', () => {
  it('injects the peer note AFTER the honesty directive and BEFORE the server prompt', async () => {
    seedLesson('robert', 'model gpt-4o-mini failing repeatedly (timeout)');

    const res = await invoke({ prompt: 'UNIQUE_USER_PROMPT', agent: 'anastasia' });
    expect(res.statusCode).toBe(200);

    const [sentPrompt] = llmService.generateExplanation.mock.calls[0];
    const honestyAt = sentPrompt.indexOf(SCIENTIFIC_HONESTY_DIRECTIVE);
    const noteAt = sentPrompt.indexOf('OPERATIONAL PEER NOTES');
    const promptAt = sentPrompt.indexOf('Validated cohort: 50 samples');

    expect(honestyAt).toBe(0);
    expect(noteAt).toBeGreaterThan(honestyAt);
    expect(promptAt).toBeGreaterThan(noteAt);
    expect(sentPrompt).toContain('model gpt-4o-mini failing repeatedly (timeout)');
  });

  it('adds nothing when the mesh has no messages and no lessons', async () => {
    const res = await invoke({ prompt: 'hello', agent: 'anastasia' });
    expect(res.statusCode).toBe(200);

    const [sentPrompt] = llmService.generateExplanation.mock.calls[0];
    expect(sentPrompt).not.toContain('OPERATIONAL PEER NOTES');
    // Still honesty-prefixed: the guard rails are unconditional.
    expect(sentPrompt.startsWith(SCIENTIFIC_HONESTY_DIRECTIVE)).toBe(true);
  });

  it('ignores an unregistered or absent agent (no mesh reads, no 400)', async () => {
    seedLesson('robert', 'a lesson nobody unnamed should see');

    const unknown = await invoke({ prompt: 'hello', agent: 'melissa' });
    expect(unknown.statusCode).toBe(200);
    expect(llmService.generateExplanation.mock.calls[0][0]).not.toContain('OPERATIONAL PEER NOTES');

    const absent = await invoke({ prompt: 'hello' });
    expect(absent.statusCode).toBe(200);
    expect(llmService.generateExplanation.mock.calls[1][0]).not.toContain('OPERATIONAL PEER NOTES');

    // The lesson is still unconsumed — nothing read it.
    expect(prisma._store.agentLesson[0].consumedBy).toEqual({});
  });

  it('acks messages and marks lessons consumed, so the next run is clean', async () => {
    seedMessage('robert', 'anastasia', 'gpt-4o-mini is flaky right now');
    seedLesson('robert', 'model gpt-4o-mini failing repeatedly (timeout)');

    await invoke({ prompt: 'first', agent: 'anastasia' });
    expect(llmService.generateExplanation.mock.calls[0][0]).toContain('gpt-4o-mini is flaky right now');
    expect(prisma._store.agentMessage[0].readBy).toHaveProperty('anastasia');
    expect(prisma._store.agentLesson[0].consumedBy).toHaveProperty('anastasia');

    await invoke({ prompt: 'second', agent: 'anastasia' });
    expect(llmService.generateExplanation.mock.calls[1][0]).not.toContain('OPERATIONAL PEER NOTES');
  });

  it('never feeds an agent its own lesson back', async () => {
    seedLesson('robert', 'roberts own observation');

    const res = await invoke({ prompt: 'hello', agent: 'robert' });
    expect(res.statusCode).toBe(200);
    expect(llmService.generateExplanation.mock.calls[0][0]).not.toContain('roberts own observation');
  });

  it('fails OPEN: a mesh outage does not fail the user request', async () => {
    seedLesson('robert', 'model gpt-4o-mini failing repeatedly (timeout)');
    prisma.agentLesson.findMany = vi.fn(async () => {
      throw new Error('agent_lessons table is on fire');
    });

    const res = await invoke({ prompt: 'hello', agent: 'anastasia' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).result).toBe('EXPLANATION');
    expect(llmService.generateExplanation.mock.calls[0][0]).not.toContain('OPERATIONAL PEER NOTES');
    expect(llmService.generateExplanation.mock.calls[0][0].startsWith(SCIENTIFIC_HONESTY_DIRECTIVE)).toBe(true);
  });

  it('records the acting agent on the audit row', async () => {
    await invoke({ prompt: 'hello', agent: 'robert' });
    const row = prisma._store.auditLog.find((r) => r.action === 'llm_invoke');
    expect(row.metadata.agent).toBe('robert');
  });
});

describe('/llm/chat retirement', () => {
  it('fails closed without reading mesh state or calling the provider', async () => {
    seedLesson('robert', 'model gpt-4o-mini failing repeatedly (timeout)');
    const res = await chat({ messages: [{ role: 'user', content: 'hi' }], agent: 'anastasia' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(llmService.generateChatResponse).not.toHaveBeenCalled();
    expect(prisma._store.agentLesson[0].consumedBy).toEqual({});
  });
});

// ─── Run end: the teaching hook ──────────────────────────────────────────────

describe('teaching hook on provider failure', () => {
  const boom = () => {
    llmService.generateExplanation.mockImplementation(async () => {
      throw Object.assign(new Error('LLM provider api.openai.com failed HTTP 503 after 3 attempt(s)'), {
        status: 503,
      });
    });
  };

  it('audits the failure but teaches nothing on the first one', async () => {
    boom();
    const res = await invoke({ prompt: 'will fail', agent: 'robert' });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    await llmRoute.__test.flushMeshWork();

    expect(prisma._store.auditLog.filter((r) => r.action === LLM_FAILURE_ACTION)).toHaveLength(1);
    expect(prisma._store.agentLesson).toHaveLength(0);
    expect(prisma._store.agentMessage).toHaveLength(0);
  });

  it('teaches at the threshold and the PEER picks it up on its next run', async () => {
    boom();
    for (let i = 0; i < FAILURE_LESSON_THRESHOLD; i++) {
      const res = await invoke({ prompt: `fail ${i}`, agent: 'robert' });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
    }
    await llmRoute.__test.flushMeshWork();

    // Robert authored a lesson and messaged Anastasia.
    expect(prisma._store.agentLesson).toHaveLength(1);
    expect(prisma._store.agentLesson[0].authorAgent).toBe('robert');
    expect(prisma._store.agentMessage).toHaveLength(1);
    expect(prisma._store.agentMessage[0].toAgent).toBe('anastasia');

    // Anastasia's very next counselling call sees it in her prompt.
    llmService.generateExplanation.mockImplementation(async () => 'EXPLANATION');
    const ok = await invoke({ prompt: 'counselling question', agent: 'anastasia' });
    expect(ok.statusCode).toBe(200);

    const sentPrompt = llmService.generateExplanation.mock.calls.at(-1)[0];
    expect(sentPrompt).toContain('OPERATIONAL PEER NOTES');
    expect(sentPrompt).toContain(MODEL);
    expect(sentPrompt).toContain('robert');
    expect(sentPrompt.startsWith(SCIENTIFIC_HONESTY_DIRECTIVE)).toBe(true);
  });

  it('does not teach when no agent is named', async () => {
    boom();
    for (let i = 0; i < FAILURE_LESSON_THRESHOLD; i++) {
      await invoke({ prompt: `anon fail ${i}` });
    }
    await llmRoute.__test.flushMeshWork();

    expect(prisma._store.auditLog.filter((r) => r.action === LLM_FAILURE_ACTION)).toHaveLength(0);
    expect(prisma._store.agentLesson).toHaveLength(0);
  });

  it('a failing teaching hook never changes what the user sees', async () => {
    boom();
    prisma.auditLog.create = vi.fn(async () => {
      throw new Error('audit table is on fire');
    });

    const res = await invoke({ prompt: 'will fail', agent: 'robert' });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    await expect(llmRoute.__test.flushMeshWork()).resolves.toBeDefined();
  });
});
