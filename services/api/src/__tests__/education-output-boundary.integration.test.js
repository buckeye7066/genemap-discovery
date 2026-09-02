import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({
  generateExplanation: vi.fn(),
  generateQuiz: vi.fn(),
  generateChatResponse: vi.fn(),
}));

vi.mock('../services/llm.js', () => provider);

import { authCookie, buildTestApp, createPrismaMock } from './setup.js';
import { __test as openai } from '../services/openai.js';

const user = { userId: 'education-output-user', email: 'education-output@example.com', role: 'user' };
const topic = 'what-is-dna';

describe('education route publication boundaries', () => {
  let app;
  let prisma;
  let cookie;
  let logs;

  beforeEach(async () => {
    delete process.env.DISABLE_MODEL_PUBLICATION;
    logs = [];
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, {
      csrf: false,
      includeEducation: true,
      fastifyOptions: {
        logger: {
          level: 'trace',
          stream: { write: (chunk) => logs.push(String(chunk)) },
        },
      },
    });
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
    expect(body.publication).toMatchObject({
      contractVersion: 1,
      status: 'available',
      reasonCode: null,
    });
    expect(body.topic).toBe(topic);
    expect(body.topicMetadata).toMatchObject({
      id: topic,
      title: 'What is DNA?',
      category: 'DNA Basics',
      catalogVersion: 1,
    });
    expect(body).not.toHaveProperty('explanation');
    expect(body.publication.content).toContain('the source');
    expect(body.publication.content).toContain('pixel');
    expect(body.publication.content).not.toContain('https://');
    expect(body.publication.content).not.toContain('](');
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
    const body = JSON.parse(response.payload);
    expect(body).toMatchObject({
      publication: {
        contractVersion: 1,
        status: 'withheld',
        content: null,
        reasonCode: 'clinical_boundary',
      },
    });
    expect(body).not.toHaveProperty('response');
    const stored = prisma._store.learningSession.find((session) => session.type === 'chat_status');
    expect(stored.content.publication).toMatchObject({
      status: 'withheld',
      content: null,
    });
    expect(JSON.stringify(stored.content)).not.toContain('Take aspirin');
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
    const body = JSON.parse(response.payload);
    expect(body.publication.status).toBe('partial');
    expect(body.publication.limitations).not.toHaveLength(0);
    expect(body).not.toHaveProperty('questions');
    expect(body.publication.content).toEqual([
      {
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water', 'Glucose', 'Aspirin'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      },
    ]);
  });

  it.each([
    'What is DNA?',
    ' what-is-dna',
    'what-is-dna ',
    'invented-topic',
  ])('rejects non-canonical education topics before provider access: %s', async (invalidTopic) => {
    const response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: { topic: invalidTopic, level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(400);
    expect(prisma.learningSession.count).not.toHaveBeenCalled();
    expect(provider.generateExplanation).not.toHaveBeenCalled();
  });

  it('rejects unknown request fields and education levels', async () => {
    const extraField = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: { topic, level: 'undergraduate', prompt: 'arbitrary' },
    });
    const unknownLevel = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: { topic, level: 'expertish' },
    });
    const missingLevel = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: { topic },
    });

    expect(extraField.statusCode).toBe(400);
    expect(unknownLevel.statusCode).toBe(400);
    expect(missingLevel.statusCode).toBe(400);
    expect(prisma.learningSession.count).not.toHaveBeenCalled();
    expect(provider.generateExplanation).not.toHaveBeenCalled();
  });

  it('maps provider failure to an unavailable artifact without sentinel content', async () => {
    provider.generateExplanation.mockRejectedValueOnce(new Error('upstream timeout'));

    const response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: { topic, level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toMatchObject({
      publication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'provider_unavailable',
      },
    });
    expect(body).not.toHaveProperty('explanation');
    const storedStatus = prisma._store.learningSession.find(
      (session) => session.type === 'explanation_status',
    );
    expect(storedStatus.content.publication.content).toBeNull();
  });

  it.each([
    ['string', 'REFUSAL_STRING_ROUTE_SECRET', null],
    [
      'structured',
      { type: 'refusal', reason: 'REFUSAL_OBJECT_ROUTE_SECRET' },
      'CONTENT_ALONGSIDE_REFUSAL_ROUTE_SECRET',
    ],
  ])('maps an OpenAI %s message refusal to a content-free withheld artifact', async (
    _shape,
    refusal,
    content,
  ) => {
    provider.generateExplanation.mockResolvedValueOnce(openai.normalizeCompletion({
      choices: [{
        finish_reason: 'stop',
        message: { content, refusal },
      }],
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: { topic, level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.publication).toMatchObject({
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'provider_filtered',
    });
    expect(body).not.toHaveProperty('explanation');

    const storedStatus = prisma._store.learningSession.find(
      (session) => session.type === 'explanation_status',
    );
    expect(storedStatus.content.publication).toEqual(body.publication);

    const externallyObservable = [
      response.payload,
      JSON.stringify(prisma._store.learningSession),
      logs.join(''),
    ].join('\n');
    expect(externallyObservable).not.toContain('ROUTE_SECRET');
  });

  it('maps truncated narrative output to partial with a visible limitation', async () => {
    provider.generateExplanation.mockResolvedValueOnce({
      text: 'DNA stores hereditary information, but this response is incomplete.',
      completion: 'truncated',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: { topic, level: 'undergraduate' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.publication).toMatchObject({
      contractVersion: 1,
      status: 'partial',
      content: 'DNA stores hereditary information, but this response is incomplete.',
      reasonCode: 'provider_truncated',
    });
    expect(body).not.toHaveProperty('explanation');
    expect(body.publication.limitations).not.toHaveLength(0);
  });

  it('replays status-less legacy learning content only as superseded', async () => {
    prisma._store.learningSession.push({
      id: 'legacy-session',
      userId: user.userId,
      topic,
      level: 'undergraduate',
      type: 'explanation',
      content: { explanation: 'legacy sentinel must not replay' },
      createdAt: new Date(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/education/progress',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.sessions[0].content.publication).toMatchObject({
      contractVersion: 1,
      status: 'superseded',
      content: null,
      reasonCode: 'legacy_status_missing',
    });
    expect(response.payload).not.toContain('legacy sentinel must not replay');
  });
});
