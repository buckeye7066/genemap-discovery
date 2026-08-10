import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import { __test as llmInternals } from '../routes/llm.js';

// Mock the LLM service so tests do not call real OpenAI/Anthropic APIs.
vi.mock('../services/llm.js', () => ({
  generateExplanation: vi.fn(async (prompt, opts) => {
    const text = `EXPL(${prompt.length}):${opts.maxTokens}`;
    return opts.includeMetadata ? { text, completion: 'complete' } : text;
  }),
  generateChatResponse: vi.fn(async (msgs, opts) => `CHAT(${msgs.length}):${opts.maxTokens}`),
  generateImage: vi.fn(async (prompt, opts) => ({ url: `https://img/${opts.size}` })),
}));

let app;
let prisma;

const STRUCTURED_RESEARCH_INPUT = Object.freeze({
  version: 1,
  cohort: { sampleCount: 50, classification: 'deidentified_aggregate', hasControls: true },
  modalities: ['wes'],
  objective: 'identify_variants',
});
const invokePayload = (options = {}) => ({
  publicationTask: 'aggregate_genomics_research',
  taskInput: STRUCTURED_RESEARCH_INPUT,
  ...(Object.keys(options).length ? { options } : {}),
});

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false, includeLlm: true });
});

afterAll(async () => app.close());

beforeEach(() => {
  prisma._reset();
  // Earlier tests in this file replace prisma.learningSession.count with a
  // canned vi.fn (e.g. always 9999). Reassign a fresh implementation here so
  // every test starts from a real-counter behaviour driven by the in-memory
  // store. Same story for findUnique / licenseAssignment.findFirst.
  prisma.learningSession.count = vi.fn(async (args = {}) => {
    let records = [...prisma._store.learningSession];
    const where = args.where || {};
    return records.filter((r) => {
      for (const [k, v] of Object.entries(where)) {
        if (k === 'createdAt' && v && typeof v === 'object' && v.gte) {
          if (!(r.createdAt >= v.gte)) return false;
          continue;
        }
        if (r[k] !== v) return false;
      }
      return true;
    }).length;
  });
  prisma.user.findUnique = vi.fn(async ({ where }) =>
    prisma._store.user.find((u) => {
      for (const [k, v] of Object.entries(where)) {
        if (u[k] !== v) return false;
      }
      return true;
    }) || null,
  );
  prisma.licenseAssignment.findFirst = vi.fn(async () => null);

  prisma._store.user.push({
    id: 'free-user',
    email: 'free@example.com',
    role: 'user',
    banned: false,
    subscriptions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma._store.user.push({
    id: 'premium-user',
    email: 'premium@example.com',
    role: 'user',
    banned: false,
    subscriptions: [{ status: 'active' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe('LLM route protection', () => {
  it('rejects anonymous /llm/invoke calls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: { prompt: 'hello' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects anonymous /llm/chat calls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/chat',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects anonymous /llm/image calls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/image',
      payload: { prompt: 'hi' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('caps maxTokens at the absolute ceiling for premium users', () => {
    expect(llmInternals.clampTokens(999_999, true)).toBe(llmInternals.PREMIUM_MAX_TOKENS);
    expect(llmInternals.clampTokens(999_999, false)).toBeLessThanOrEqual(llmInternals.DEFAULT_MAX_TOKENS);
  });

  it('treats negative or NaN maxTokens as the default', () => {
    expect(llmInternals.clampTokens(-1, false)).toBe(llmInternals.DEFAULT_MAX_TOKENS);
    expect(llmInternals.clampTokens(NaN, false)).toBe(llmInternals.DEFAULT_MAX_TOKENS);
  });

  it('clamps temperature to [0, 2]', () => {
    expect(llmInternals.clampTemperature(-5)).toBe(0);
    expect(llmInternals.clampTemperature(99)).toBe(2);
    expect(llmInternals.clampTemperature(0.4)).toBe(0.4);
  });

  it('successful free-tier /llm/invoke returns a canonical publication envelope', async () => {
    // Pre-fill learningSession so we are nowhere near the daily limit
    prisma.learningSession.count = vi.fn(async () => 0);
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);
    prisma.user.findUnique = vi.fn(async ({ where }) => prisma._store.user.find((u) => u.id === where.id));

    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' }) },
      payload: invokePayload({ maxTokens: 999999 }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.disclaimer).toMatch(/educational/i);
    expect(body.publication).toMatchObject({
      contractVersion: 1,
      status: 'available',
      reasonCode: null,
    });
    expect(body).not.toHaveProperty('result');
    // Server clamped maxTokens, never sent the user's giant value
    expect(body.publication.content).toMatch(/EXPL\(\d+\):\d+$/);
    const reportedMax = Number(body.publication.content.split(':')[1]);
    expect(reportedMax).toBeLessThanOrEqual(llmInternals.DEFAULT_MAX_TOKENS);
  });

  it('refuses /llm/invoke when daily free-tier explanations are exhausted', async () => {
    // Force usage limit to be hit
    prisma.learningSession.count = vi.fn(async () => 9999);
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);
    prisma.user.findUnique = vi.fn(async ({ where }) => prisma._store.user.find((u) => u.id === where.id));

    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' }) },
      payload: invokePayload(),
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/daily limit/i);
  });

  it('persistently increments usage across multiple successful calls and blocks once the limit is hit', async () => {
    // No per-test vi.fn override here — beforeEach already wires count/find
    // to the in-memory store so we exercise the actual persistent counter.
    // Free-tier explanations_per_day = 5.
    const cookie = authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' });

    // 5 successful calls should all return 200 and persist a learning session each.
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/llm/invoke',
        headers: { cookie },
        payload: invokePayload(),
      });
      expect(res.statusCode).toBe(200);
    }

    // After 5 successful calls, the LearningSession store must contain 5
    // 'explanation' rows for this user — proves usage is *persistent*.
    const persisted = prisma._store.learningSession.filter(
      (s) => s.userId === 'free-user' && s.type === 'explanation',
    );
    expect(persisted).toHaveLength(5);

    // The 6th call must be denied by the limit check.
    const blocked = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie },
      payload: invokePayload(),
    });
    expect(blocked.statusCode).toBe(403);
    expect(JSON.parse(blocked.body).error).toMatch(/daily limit/i);

    // And no extra row was written for the denied call.
    expect(
      prisma._store.learningSession.filter(
        (s) => s.userId === 'free-user' && s.type === 'explanation',
      ),
    ).toHaveLength(5);
  });

  it('retired arbitrary chat never consumes usage and structured invoke remains available', async () => {
    const cookie = authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' });

    const blocked = await app.inject({
      method: 'POST',
      url: '/llm/chat',
      headers: { cookie },
      payload: { messages: [{ role: 'user', content: 'arbitrary' }] },
    });
    expect(blocked.statusCode).toBeGreaterThanOrEqual(400);
    expect(prisma._store.learningSession).toHaveLength(0);

    const stillOk = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie },
      payload: invokePayload(),
    });
    expect(stillOk.statusCode).toBe(200);
  });

  it('maps upstream LLM failure to unavailable content and persists null-content telemetry', async () => {
    const llmService = await import('../services/llm.js');
    llmService.generateExplanation.mockImplementationOnce(async () => {
      throw new Error('upstream timeout');
    });

    const cookie = authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' });
    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie },
      payload: invokePayload(),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({
      publication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'provider_unavailable',
      },
    });
    expect(body).not.toHaveProperty('result');

    const charged = prisma._store.learningSession.filter(
      (s) => s.userId === 'free-user' && s.type === 'explanation',
    );
    const persistedStatus = prisma._store.learningSession.filter(
      (s) => s.userId === 'free-user' && s.type === 'publication_status',
    );
    expect(charged).toHaveLength(0);
    expect(persistedStatus).toHaveLength(1);
    expect(persistedStatus[0].content.publication).toMatchObject({
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'provider_unavailable',
    });
    expect(JSON.stringify(persistedStatus[0].content)).not.toContain('upstream timeout');
  });

  it('maps provider truncation to a visible partial artifact', async () => {
    const llmService = await import('../services/llm.js');
    llmService.generateExplanation.mockResolvedValueOnce({
      text: 'A bounded but incomplete research summary.',
      completion: 'truncated',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: {
        cookie: authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' }),
      },
      payload: invokePayload(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.publication).toMatchObject({
      contractVersion: 1,
      status: 'partial',
      content: 'A bounded but incomplete research summary.',
      reasonCode: 'provider_truncated',
    });
    expect(body).not.toHaveProperty('result');
    expect(body.publication.limitations).not.toHaveLength(0);
  });

  it('rejects unsupported generation option fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: {
        cookie: authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' }),
      },
      payload: invokePayload({ maxTokens: 100, arbitrary: true }),
    });

    expect(res.statusCode).toBe(400);
    expect(prisma.learningSession.count).not.toHaveBeenCalled();
  });

  it('premium user is not subject to the daily limit', async () => {
    const cookie = authCookie({
      userId: 'premium-user',
      email: 'premium@example.com',
      role: 'user',
    });

    // Try far more than the free limit.
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/llm/invoke',
        headers: { cookie },
        payload: invokePayload(),
      });
      expect(res.statusCode).toBe(200);
    }
  });
});
