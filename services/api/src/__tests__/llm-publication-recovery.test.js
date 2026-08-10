import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import { generateExplanation } from '../services/llm.js';
import { __test as llmInternals } from '../routes/llm.js';

vi.mock('../services/llm.js', () => ({
  generateExplanation: vi.fn(async () => 'provider output must never be reached while disabled'),
  generateChatResponse: vi.fn(),
  generateImage: vi.fn(),
}));

let app;
let prisma;

const payload = {
  publicationTask: 'aggregate_genomics_research',
  taskInput: {
    version: 1,
    cohort: {
      sampleCount: 50,
      classification: 'deidentified_aggregate',
      hasControls: true,
    },
    modalities: ['wes'],
    objective: 'identify_variants',
  },
};

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false, includeLlm: true });
});

afterAll(async () => app.close());

afterEach(() => {
  delete process.env.DISABLE_MODEL_PUBLICATION;
});

beforeEach(() => {
  prisma._reset();
  vi.clearAllMocks();
  prisma._store.user.push({
    id: 'recovery-user',
    email: 'recovery@example.com',
    role: 'user',
    banned: false,
    subscriptions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.user.findUnique = vi.fn(async ({ where }) =>
    prisma._store.user.find((user) => user.id === where.id) || null,
  );
  prisma.licenseAssignment.findFirst = vi.fn(async () => null);
  prisma.learningSession.count = vi.fn(async () => 0);
});

describe('model publication recovery switch', () => {
  it('is enabled by default and fails closed only for the exact switch value', () => {
    expect(() => llmInternals.assertModelPublicationEnabled({})).not.toThrow();
    expect(() => llmInternals.assertModelPublicationEnabled({ DISABLE_MODEL_PUBLICATION: '0' }))
      .not.toThrow();
    expect(() => llmInternals.assertModelPublicationEnabled({ DISABLE_MODEL_PUBLICATION: '1' }))
      .toThrow(/temporarily unavailable/i);
  });

  it('returns 503 before provider invocation or usage accounting', async () => {
    process.env.DISABLE_MODEL_PUBLICATION = '1';
    const response = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: {
        cookie: authCookie({
          userId: 'recovery-user',
          email: 'recovery@example.com',
          role: 'user',
        }),
      },
      payload,
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(body.details?.publication).toMatchObject({
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'model_publication_disabled',
    });
    expect(generateExplanation).not.toHaveBeenCalled();
    expect(prisma._store.learningSession).toHaveLength(0);
  });
});
