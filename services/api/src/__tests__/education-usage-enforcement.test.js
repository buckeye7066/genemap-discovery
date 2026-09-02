import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({
  generateExplanation: vi.fn(),
  generateQuiz: vi.fn(),
  generateChatResponse: vi.fn(),
}));

vi.mock('../services/llm.js', () => provider);

import { authCookie, buildTestApp, createPrismaMock } from './setup.js';

const learner = {
  userId: 'quota-user',
  email: 'quota@example.com',
  role: 'user',
};
const requestPayload = { topic: 'what-is-dna', level: 'undergraduate' };

function seedSession(prisma, {
  type = 'explanation',
  createdAt = new Date(),
  id = `session-${prisma._store.learningSession.length + 1}`,
} = {}) {
  prisma._store.learningSession.push({
    id,
    userId: learner.userId,
    topic: requestPayload.topic,
    level: requestPayload.level,
    type,
    content: {},
    createdAt,
  });
}

describe('free-tier education usage enforcement', () => {
  let app;
  let prisma;
  let cookie;

  beforeEach(async () => {
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, {
      csrf: false,
      includeEducation: true,
    });
    cookie = authCookie(learner, prisma);
    const user = prisma._store.user.find((record) => record.id === learner.userId);
    user.subscriptions = [];
    provider.generateExplanation.mockResolvedValue({
      text: 'DNA stores hereditary information.',
      completion: 'complete',
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app?.close();
  });

  async function explain() {
    return app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie },
      payload: requestPayload,
    });
  }

  it('atomically reserves and finalizes a counted free-tier result', async () => {
    const response = await explain();

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).usage).toMatchObject({
      used: 1,
      limit: 5,
      type: 'explanation',
      remaining: 4,
    });
    expect(prisma._store.learningSession).toHaveLength(1);
    expect(prisma._store.learningSession[0]).toMatchObject({
      userId: learner.userId,
      type: 'explanation',
    });
    expect(prisma._store.learningSession[0].content.publication.status).toBe('available');
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('counts active reservations and blocks the provider at the daily boundary', async () => {
    for (let index = 0; index < 4; index += 1) seedSession(prisma);
    seedSession(prisma, { type: 'quota_reservation:explanation' });

    const response = await explain();

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.payload).code).toBe('DAILY_TIER_LIMIT_REACHED');
    expect(provider.generateExplanation).not.toHaveBeenCalled();
    expect(prisma._store.learningSession).toHaveLength(5);
  });

  it('ages abandoned reservations out instead of consuming the whole day', async () => {
    for (let index = 0; index < 4; index += 1) seedSession(prisma);
    seedSession(prisma, {
      type: 'quota_reservation:explanation',
      createdAt: new Date(Date.now() - (6 * 60 * 1000)),
      id: 'stale-reservation',
    });

    const response = await explain();

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).usage).toMatchObject({ used: 5, remaining: 0 });
    expect(provider.generateExplanation).toHaveBeenCalledTimes(1);
    expect(prisma._store.learningSession.some((session) => (
      session.id === 'stale-reservation'
    ))).toBe(false);
  });

  it('returns 503 before provider access when a quota reservation cannot persist', async () => {
    prisma.learningSession.create.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await explain();

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload).code).toBe('USAGE_ACCOUNTING_UNAVAILABLE');
    expect(provider.generateExplanation).not.toHaveBeenCalled();
    expect(response.payload).not.toContain('database unavailable');
  });

  it('does not publish generated content when final accounting fails', async () => {
    prisma.learningSession.updateMany.mockRejectedValueOnce(new Error('write failed'));

    const response = await explain();

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.payload).code).toBe('USAGE_ACCOUNTING_UNAVAILABLE');
    expect(provider.generateExplanation).toHaveBeenCalledTimes(1);
    expect(response.payload).not.toContain('DNA stores hereditary information');
    expect(prisma._store.learningSession).toEqual([]);
  });

  it('retries a serializable conflict before publishing', async () => {
    const transactionImplementation = prisma.$transaction.getMockImplementation();
    const conflict = new Error('serialization conflict');
    conflict.code = 'P2034';
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementation(transactionImplementation);

    const response = await explain();

    expect(response.statusCode).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(provider.generateExplanation).toHaveBeenCalledTimes(1);
    expect(prisma._store.learningSession).toHaveLength(1);
  });

  it('does not expose an in-flight reservation through learning progress', async () => {
    seedSession(prisma, { type: 'quota_reservation:explanation' });
    seedSession(prisma, { type: 'explanation', id: 'completed-session' });

    const response = await app.inject({
      method: 'GET',
      url: '/education/progress',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe('completed-session');
  });
});
