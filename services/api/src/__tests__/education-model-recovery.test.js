import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({
  generateExplanation: vi.fn(),
  generateImage: vi.fn(),
  generateQuiz: vi.fn(),
  generateChatResponse: vi.fn(),
}));

vi.mock('../services/llm.js', () => provider);

import { authCookie, buildTestApp, createPrismaMock } from './setup.js';

const user = { userId: 'education-recovery-user', email: 'learner@example.com', role: 'user' };
const topic = 'what-is-dna';

describe('education model-publication recovery switch', () => {
  let app;
  let prisma;

  beforeEach(async () => {
    process.env.DISABLE_MODEL_PUBLICATION = '1';
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, {
      csrf: false,
      includeEducation: true,
      fastifyOptions: { genReqId: () => '_abc' },
    });
  });

  afterEach(async () => {
    delete process.env.DISABLE_MODEL_PUBLICATION;
    vi.clearAllMocks();
    await app?.close();
  });

  it.each([
    ['/education/explain', { topic, level: 'undergraduate' }],
    ['/education/image', { topic, level: 'undergraduate' }],
    ['/education/quiz', { topic, level: 'undergraduate', questionCount: 3 }],
    ['/education/chat', {
      publicationTask: 'genetics_education',
      taskInput: {
        version: 1,
        topic,
        level: 'undergraduate',
        interaction: 'give_example',
      },
    }],
  ])('returns 503 before quota accounting or provider invocation for %s', async (url, payload) => {
    const cookie = authCookie(user, prisma);
    const seeded = prisma._store.user.find((record) => record.id === user.userId);
    seeded.subscriptions = [];

    const response = await app.inject({
      method: 'POST',
      url,
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.payload);
    expect(body.error).toMatch(/temporarily unavailable during safe recovery/i);
    expect(body.details?.publication).toMatchObject({
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'model_publication_disabled',
      correlationId: 'request-_abc:education-recovery',
    });
    expect(body.details.publication.correlationId).toMatch(/^[A-Za-z0-9]/u);
    expect(prisma.learningSession.count).not.toHaveBeenCalled();
    expect(provider.generateExplanation).not.toHaveBeenCalled();
    expect(provider.generateImage).not.toHaveBeenCalled();
    expect(provider.generateQuiz).not.toHaveBeenCalled();
    expect(provider.generateChatResponse).not.toHaveBeenCalled();
  });
});
