import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPrismaMock, buildTestApp, authCookie } from './setup.js';

/**
 * Regression guard for POST /education/progress input validation.
 *
 * Before the fix the handler destructured `request.body` directly, so:
 *  - a missing `topicId` made Prisma drop the filter
 *    (`where: { userId, topicId: undefined }`), matching an UNRELATED topic's
 *    row and updating the wrong progress record;
 *  - a non-numeric `score` wrote NaN into an Int column.
 * The route now parses a Zod schema, rejecting both with a clean 400.
 */
describe('POST /education/progress input validation', () => {
  let app;
  let prisma;
  const user = { userId: 'u-progress-1', email: 'learner@example.com', role: 'user' };

  beforeEach(async () => {
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeEducation: true });
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a progress row for a valid payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/progress',
      headers: { cookie: authCookie(user, prisma) },
      payload: { topicId: 'what-is-dna', score: 80, totalQuestions: 10 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.topicId).toBe('what-is-dna');
    expect(body.bestScore).toBe(80);
  });

  it('rejects a missing topicId with 400 instead of updating an unrelated row', async () => {
    // Seed a progress row under a DIFFERENT topic. With the old bug an
    // undefined topicId would have matched and mutated this record.
    prisma._store.learningProgress.push({
      id: 'lp-other', userId: user.userId, topicId: 'crispr',
      bestScore: 50, totalQuestions: 5, attempts: 1,
      lastAttemptAt: new Date(), createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/education/progress',
      headers: { cookie: authCookie(user, prisma) },
      payload: { score: 99 },
    });

    expect(res.statusCode).toBe(400);
    // The unrelated row must be untouched.
    const other = prisma._store.learningProgress.find((r) => r.id === 'lp-other');
    expect(other.bestScore).toBe(50);
  });

  it('rejects a non-numeric score with 400 (no NaN write)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/progress',
      headers: { cookie: authCookie(user, prisma) },
      payload: { topicId: 'transcription', score: 'not-a-number' },
    });
    expect(res.statusCode).toBe(400);
  });
});
