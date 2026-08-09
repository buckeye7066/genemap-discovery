import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateExplanation = vi.fn();
const generateImage = vi.fn();
const generateQuiz = vi.fn();
const generateChatResponse = vi.fn();

vi.mock('../services/llm.js', () => ({
  generateExplanation,
  generateImage,
  generateQuiz,
  generateChatResponse,
}));

import { authCookie, buildTestApp, createPrismaMock } from './setup.js';

const user = { userId: 'education-recovery-user', email: 'learner@example.com', role: 'user' };
const topic = 'what-is-dna';

describe('education model-publication recovery switch', () => {
  let app;
  let prisma;

  beforeEach(async () => {
    process.env.DISABLE_MODEL_PUBLICATION = '1';
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeEducation: true });
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
    expect(JSON.parse(response.payload).error).toMatch(/temporarily unavailable during safe recovery/i);
    expect(prisma.learningSession.count).not.toHaveBeenCalled();
    expect(generateExplanation).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
    expect(generateQuiz).not.toHaveBeenCalled();
    expect(generateChatResponse).not.toHaveBeenCalled();
  });
});