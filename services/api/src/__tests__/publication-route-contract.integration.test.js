import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandler } from '../middleware/errorHandler.js';

const boundary = vi.hoisted(() => ({
  enforceUsageLimit: vi.fn(),
  generateChatResponse: vi.fn(),
  generateExplanation: vi.fn(),
  generateImage: vi.fn(),
  generateQuiz: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn(async (request) => {
    request.user = { userId: 'route-contract-user', role: 'user' };
  }),
}));

vi.mock('../middleware/entitlements.js', () => ({
  checkEducationEntitlement: vi.fn(async (request) => {
    request.entitlements = { isPremium: false, tier: 'free', limits: {} };
  }),
  enforceUsageLimit: boundary.enforceUsageLimit,
  recordUsage: boundary.recordUsage,
}));

vi.mock('../services/genomicGuard.js', () => ({
  assertNoRawGenomicLLM: vi.fn(async () => false),
}));

vi.mock('../services/llm.js', () => ({
  generateChatResponse: boundary.generateChatResponse,
  generateExplanation: boundary.generateExplanation,
  generateImage: boundary.generateImage,
  generateQuiz: boundary.generateQuiz,
}));

vi.mock('../utils/audit.js', () => ({
  createAuditLog: vi.fn(async () => undefined),
}));

import educationRoutes from '../routes/education.js';
import llmRoutes from '../routes/llm.js';
import { resolveEducationTopic } from '../config/educationCatalog.js';
import { getSources } from '../services/educationSources.js';

const aggregateRequest = {
  publicationTask: 'aggregate_genomics_research',
  taskInput: {
    version: 1,
    cohort: {
      sampleCount: 20,
      classification: 'deidentified_aggregate',
      hasControls: true,
    },
    modalities: ['wes'],
    objective: 'identify_variants',
  },
};

function createRoutePrisma() {
  const sessions = [];
  return {
    sessions,
    learningSession: {
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }) => {
        const session = { id: `session-${sessions.length + 1}`, ...data, createdAt: new Date() };
        sessions.push(session);
        return session;
      }),
      findMany: vi.fn(async () => sessions),
      groupBy: vi.fn(async () => []),
    },
    learningProgress: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => data),
      update: vi.fn(async ({ data }) => data),
    },
  };
}

describe('publication route contracts without the full application harness', () => {
  let app;
  let prisma;

  beforeEach(async () => {
    delete process.env.DISABLE_MODEL_PUBLICATION;
    vi.clearAllMocks();
    boundary.enforceUsageLimit.mockImplementation(async (request) => {
      request.usageInfo = { used: 0, limit: 5, remaining: 5 };
    });
    boundary.recordUsage.mockResolvedValue(null);
    boundary.generateExplanation.mockResolvedValue({
      text: 'DNA and inherited variation can be studied with bounded research methods.',
      completion: 'complete',
    });
    boundary.generateChatResponse.mockResolvedValue({
      text: 'DNA stores hereditary information.',
      completion: 'complete',
    });
    boundary.generateQuiz.mockResolvedValue({
      text: [{
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      }],
      completion: 'complete',
    });
    boundary.generateImage.mockResolvedValue({
      url: 'https://provider.example/dna.png',
      revisedPrompt: 'A neutral educational diagram of DNA.',
    });

    prisma = createRoutePrisma();
    app = Fastify({ logger: false });
    app.decorate('prisma', prisma);
    app.setErrorHandler(errorHandler);
    await app.register(educationRoutes, { prefix: '/education' });
    await app.register(llmRoutes, { prefix: '/llm' });
    await app.ready();
  });

  afterEach(async () => {
    delete process.env.DISABLE_MODEL_PUBLICATION;
    await app?.close();
  });

  it('attaches curated sources only to current server-owned topic metadata', () => {
    const resolved = resolveEducationTopic('what-is-dna');
    expect(getSources(resolved).length).toBeGreaterThan(0);
    expect(getSources({ id: 'what-is-dna', category: 'DNA Basics' })).toEqual([]);
    expect(getSources({ ...resolved, catalogVersion: 999 })).toEqual([]);
  });

  it.each(['What is DNA?', ' what-is-dna', 'invented-topic'])(
    'rejects non-canonical topic %s before quota or provider access',
    async (topic) => {
      const response = await app.inject({
        method: 'POST',
        url: '/education/explain',
        payload: { topic, level: 'undergraduate' },
      });

      expect(response.statusCode).toBe(400);
      expect(boundary.enforceUsageLimit).not.toHaveBeenCalled();
      expect(boundary.generateExplanation).not.toHaveBeenCalled();
      expect(prisma.learningSession.create).not.toHaveBeenCalled();
    },
  );

  it('returns and persists a canonical available education artifact', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      payload: { topic: 'what-is-dna', level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.publication).toMatchObject({
      contractVersion: 1,
      status: 'available',
      content: 'DNA and inherited variation can be studied with bounded research methods.',
      reasonCode: null,
    });
    expect(body).not.toHaveProperty('explanation');
    expect(prisma.sessions[0].content.publication).toEqual(body.publication);
  });

  it('fails generated images closed before quota or provider access', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/education/image',
      payload: { topic: 'what-is-dna', level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.publication).toMatchObject({
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'image_output_verification_unavailable',
    });
    expect(body).not.toHaveProperty('imageUrl');
    expect(body).not.toHaveProperty('revisedPrompt');
    expect(boundary.enforceUsageLimit).not.toHaveBeenCalled();
    expect(boundary.generateImage).not.toHaveBeenCalled();
    expect(prisma.sessions[0].type).toBe('image_status');
  });

  it('maps provider timeout to unavailable and persists no provider text', async () => {
    const error = new Error('secret provider timeout detail');
    error.code = 'LLM_PROVIDER_TIMEOUT';
    boundary.generateExplanation.mockRejectedValueOnce(error);

    const response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      payload: { topic: 'what-is-dna', level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      publication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'provider_timeout',
      },
    });
    expect(body).not.toHaveProperty('explanation');
    expect(prisma.sessions[0].type).toBe('explanation_status');
    expect(JSON.stringify(prisma.sessions[0])).not.toContain('secret provider timeout detail');
  });

  it('fails closed on an unexpected provider completion value', async () => {
    boundary.generateQuiz.mockResolvedValueOnce({
      text: [{
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      }],
      completion: 'unexpected_provider_state',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/education/quiz',
      payload: { topic: 'what-is-dna', level: 'undergraduate', questionCount: 1 },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      publication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'provider_incomplete',
      },
    });
    expect(body).not.toHaveProperty('questions');
  });

  it('returns a canonical kill-switch artifact before quota and provider access', async () => {
    process.env.DISABLE_MODEL_PUBLICATION = '1';

    const response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      payload: { topic: 'what-is-dna', level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body).details.publication).toMatchObject({
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'model_publication_disabled',
    });
    expect(boundary.enforceUsageLimit).not.toHaveBeenCalled();
    expect(boundary.generateExplanation).not.toHaveBeenCalled();
  });

  it('validates structured invocation before quota and returns an artifact envelope', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: { ...aggregateRequest, unexpected: true },
    });
    expect(invalid.statusCode).toBe(400);
    const paddedTask = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: { ...aggregateRequest, publicationTask: ' aggregate_genomics_research' },
    });
    expect(paddedTask.statusCode).toBe(400);
    expect(boundary.enforceUsageLimit).not.toHaveBeenCalled();

    const valid = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: aggregateRequest,
    });
    expect(valid.statusCode).toBe(200);
    const body = JSON.parse(valid.body);
    expect(body.publication).toMatchObject({
      contractVersion: 1,
      status: 'available',
      content: expect.any(String),
    });
    expect(body).not.toHaveProperty('result');
    expect(boundary.recordUsage).toHaveBeenCalledWith(
      prisma,
      'route-contract-user',
      'explanation',
      expect.objectContaining({ publication: body.publication }),
    );
  });

  it('records unavailable invocation telemetry without charging an explanation', async () => {
    const error = new Error('secret connection detail');
    error.code = 'LLM_PROVIDER_CONNECTION';
    boundary.generateExplanation.mockRejectedValueOnce(error);

    const response = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: aggregateRequest,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      publication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'provider_connection',
      },
    });
    expect(body).not.toHaveProperty('result');
    expect(boundary.recordUsage).toHaveBeenCalledWith(
      prisma,
      'route-contract-user',
      'publication_status',
      expect.objectContaining({ publication: body.publication }),
    );
    expect(JSON.stringify(boundary.recordUsage.mock.calls)).not.toContain('secret connection detail');
  });
});
