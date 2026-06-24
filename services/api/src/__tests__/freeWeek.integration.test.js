/**
 * Integration: the global Free Week promotion, exercised through the REAL
 * Fastify pipeline (cookie + auth + route) against the in-memory Prisma mock —
 * the same harness the E2E suite uses.
 *
 * Proves the runtime contract that the unit test cannot: a user with NO
 * subscription is reported as Premium by GET /auth/me while the window is open,
 * and reverts to free the moment it closes. This is what makes "log in and get
 * the app free" true end to end.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock } from './setup.js';
import { hashPassword } from '../utils/auth.js';

let app;
let prisma;
const originalEnv = { ...process.env };

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false });
});

afterAll(async () => {
  await app.close();
  process.env = originalEnv;
});

beforeEach(() => {
  prisma._reset();
  prisma.user.findUnique = vi.fn(async ({ where }) =>
    prisma._store.user.find((u) => Object.entries(where).every(([k, v]) => u[k] === v)) || null,
  );
  prisma.licenseAssignment.findFirst = vi.fn(async () => null);
  prisma.preBannedUser.findFirst = vi.fn(async () => null);
  delete process.env.FREE_WEEK_ENABLED;
  delete process.env.FREE_WEEK_START;
  delete process.env.FREE_WEEK_END;
});

async function loginFreeUser() {
  const email = 'freeuser@example.com';
  const passwordHash = await hashPassword('CorrectPass1!');
  prisma._store.user.push({
    id: `user-${email}`, email, passwordHash, role: 'user',
    banned: false, subscriptions: [], createdAt: new Date(), updatedAt: new Date(),
  });
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'CorrectPass1!' } });
  expect(res.statusCode).toBe(200);
  const at = res.cookies.find((c) => c.name === 'accessToken');
  const rt = res.cookies.find((c) => c.name === 'refreshToken');
  return `accessToken=${at.value}; refreshToken=${rt.value}`;
}

async function getMe(cookieHeader) {
  const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader } });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe('Free Week — through the real /auth/me pipeline', () => {
  it('a non-subscribed user is NOT premium when the promotion is off', async () => {
    const cookie = await loginFreeUser();
    const me = await getMe(cookie);
    expect(me.entitlements.isPremium).toBe(false);
    expect(me.entitlements.isFreeWeek).toBe(false);
  });

  it('the SAME user becomes Premium when Free Week is enabled', async () => {
    process.env.FREE_WEEK_ENABLED = 'true';
    const cookie = await loginFreeUser();
    const me = await getMe(cookie);
    expect(me.entitlements.isPremium).toBe(true);
    expect(me.entitlements.isFreeWeek).toBe(true);
    expect(me.entitlements.freeWeek.active).toBe(true);
  });

  it('reverts to free once the window has closed (self-expiry)', async () => {
    process.env.FREE_WEEK_ENABLED = 'true';
    process.env.FREE_WEEK_START = '2020-01-01T00:00:00Z';
    process.env.FREE_WEEK_END = '2020-01-08T00:00:00Z';
    const cookie = await loginFreeUser();
    const me = await getMe(cookie);
    expect(me.entitlements.isPremium).toBe(false);
    expect(me.entitlements.isFreeWeek).toBe(false);
  });
});
