import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({
  generateExplanation: vi.fn(),
  generateImage: vi.fn(),
  generateQuiz: vi.fn(),
  generateChatResponse: vi.fn(),
}));

vi.mock('../services/llm.js', () => provider);

import { authCookie, buildTestApp, createPrismaMock } from './setup.js';

const user = { userId: 'education-output-user', email: 'education-output@example.com', role: 'user' };
const topic = 'what-is-dna';

describe('education route publication boundaries', () => {
  let app;
  let prisma;
  let cookie;

  beforeEach(async () => {
    delete process.env.DISABLE_MODEL_PUBLICATION;
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeEducation: true });
    cookie = authCookie(user, prisma);
    const seeded = prisma._store.user.find((record) => record.id === user.userId);
    seeded.subscriptions = [];
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app?.close();
  });

  it('sanitizes explanation Markdown and provider-created targets', async () => {
    provider.generateExplanation.mockResolvedValue(
      'Review [the source](https://untrusted.example) and ![pixel](https://tracker.example/p.png).',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: { topic, level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.explanation).toContain('the source');
    expect(body.explanation).toContain('pixel');
    expect(body.explanation).not.toContain('https://');
    expect(body.explanation).not.toContain('](');
  });

  it('withholds direct medication guidance from the guided tutor', async () => {
    provider.generateChatResponse.mockResolvedValue('Take aspirin.');

    const response = await app.inject({
      method: 'POST',
      url: '/education/chat',
      headers: { cookie },
      payload: {
        publicationTask: 'genetics_education',
        taskInput: {
          version: 1,
          topic,
          level: 'undergraduate',
          interaction: 'give_example',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).response).toMatch(/response was withheld/i);
  });

  it('drops an unsafe quiz question without shifting a safe answer index', async () => {
    provider.generateQuiz.mockResolvedValue([
      {
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water', 'Glucose', 'Aspirin'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      },
      {
        question: 'What should this patient take?',
        options: ['Take aspirin.', 'Water', 'DNA', 'RNA'],
        correctIndex: 0,
        explanation: 'Aspirin is recommended.',
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/education/quiz',
      headers: { cookie },
      payload: { topic, level: 'undergraduate', questionCount: 5 },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).questions).toEqual([
      {
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water', 'Glucose', 'Aspirin'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      },
    ]);
  });

  it('sanitizes the image provider revised prompt while preserving the provider URL', async () => {
    provider.generateImage.mockResolvedValue({
      url: 'https://official-provider.example/generated-image.png',
      revisedPrompt: 'Diagram based on [untrusted](https://tracker.example/pixel).',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/education/image',
      headers: { cookie },
      payload: { topic, level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.imageUrl).toBe('https://official-provider.example/generated-image.png');
    expect(body.revisedPrompt).toContain('untrusted');
    expect(body.revisedPrompt).not.toContain('https://tracker.example');
  });
});