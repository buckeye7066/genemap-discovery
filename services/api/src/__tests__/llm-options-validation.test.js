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
    app = Fastify({ logger: false });
    app.decorate('prisma', {});
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
    expect(response.json().message).toMatch(/generation options must be an object/i);
    expect(mocks.enforceUsageLimit).not.toHaveBeenCalled();
    expect(mocks.resolvePublicationTaskReferences).not.toHaveBeenCalled();
    expect(mocks.generateExplanation).not.toHaveBeenCalled();
  });
});
