import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforceUsageLimit: vi.fn(async () => {}),
  generateExplanation: vi.fn(async () => ({ text: 'provider output', completion: 'complete' })),
  resolvePublicationTaskReferences: vi.fn(async () => ({})),
}));

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn(async (request) => {
    request.user = { userId: 'validation-test-user', role: 'user' };
  }),
}));

vi.mock('../middleware/entitlements.js', () => ({
  checkEducationEntitlement: vi.fn(async (request) => {
    request.entitlements = { isPremium: false };
  }),
  enforceUsageLimit: mocks.enforceUsageLimit,
  recordUsage: vi.fn(async () => {}),
}));

vi.mock('../services/llm.js', () => ({
  generateExplanation: mocks.generateExplanation,
}));

vi.mock('../services/genomicGuard.js', () => ({
  assertNoRawGenomicLLM: vi.fn(async () => false),
}));

vi.mock('../services/publicationResolvers.js', () => ({
  resolvePublicationTaskReferences: mocks.resolvePublicationTaskReferences,
}));

vi.mock('../utils/audit.js', () => ({
  createAuditLog: vi.fn(async () => {}),
}));

import llmRoutes from '../routes/llm.js';
import { errorHandler } from '../middleware/errorHandler.js';

const STRUCTURED_RESEARCH_INPUT = Object.freeze({
  version: 1,
  cohort: { sampleCount: 50, classification: 'deidentified_aggregate', hasControls: true },
  modalities: ['wes'],
  objective: 'identify_variants',
});

let app;

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.clearAllMocks();
});

describe('/llm/invoke generation option validation', () => {
  it('rejects explicit options:null before quota, reference resolution, or provider work', async () => {
    app = Fastify({
      logger: false,
      genReqId: () => 'options-null-validation',
    });
    app.decorate('prisma', {});
    app.setErrorHandler(errorHandler);
    await app.register(llmRoutes, { prefix: '/llm' });

    const response = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: {
        publicationTask: 'aggregate_genomics_research',
        taskInput: STRUCTURED_RESEARCH_INPUT,
        options: null,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'generation options must be an object',
      requestId: 'options-null-validation',
    });
    expect(mocks.enforceUsageLimit).not.toHaveBeenCalled();
    expect(mocks.resolvePublicationTaskReferences).not.toHaveBeenCalled();
    expect(mocks.generateExplanation).not.toHaveBeenCalled();
  });

  it.each([
    ['model', 'caller-selected-model'],
    ['size', '2048x2048'],
    ['quality', 'hd'],
    ['publicationTask', 'aggregate_genomics_research'],
    ['arbitrary', true],
  ])('rejects options.%s before quota, reference resolution, or provider work', async (field, value) => {
    app = Fastify({
      logger: false,
      genReqId: () => `options-${field}-validation`,
    });
    app.decorate('prisma', {});
    app.setErrorHandler(errorHandler);
    await app.register(llmRoutes, { prefix: '/llm' });

    const response = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: {
        publicationTask: 'aggregate_genomics_research',
        taskInput: STRUCTURED_RESEARCH_INPUT,
        options: { maxTokens: 100, [field]: value },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'generation options contain unsupported fields',
      requestId: `options-${field}-validation`,
    });
    expect(mocks.enforceUsageLimit).not.toHaveBeenCalled();
    expect(mocks.resolvePublicationTaskReferences).not.toHaveBeenCalled();
    expect(mocks.generateExplanation).not.toHaveBeenCalled();
  });
});
