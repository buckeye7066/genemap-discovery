import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import { hashPassword, generateRefreshToken, hashRefreshToken } from '../utils/auth.js';

/**
 * Seed a valid, session-matched refresh token for a user and return a cookie
 * string carrying ONLY that refresh token (no access token) — simulating the
 * common case where the 15-min access token has expired but the 7-day refresh
 * token is still good.
 */
async function refreshOnlyCookie(prisma, userId) {
  const refreshToken = generateRefreshToken({ userId });
  const refreshTokenHash = await hashRefreshToken(refreshToken);
  prisma._store.session.push({
    id: 'sess-1',
    userId,
    refreshTokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  });
  return `refreshToken=${refreshToken}`;
}

let app;
let prisma;

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  prisma._reset();
});

// ─── POST /auth/register ─────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('should register a new user and return user object with cookies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'alice@example.com', password: 'StrongPass1!' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('alice@example.com');
    expect(body.user.role).toBe('user');
    expect(body.user.id).toBeDefined();

    // Should set accessToken and refreshToken cookies
    const cookies = res.cookies;
    const accessCookie = cookies.find((c) => c.name === 'accessToken');
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
  });

  it('should reject duplicate email', async () => {
    // Seed a user first
    prisma._store.user = [];
    const passwordHash = await hashPassword('StrongPass1!');
    prisma._store.user.push({
      id: 'existing-id',
      email: 'alice@example.com',
      passwordHash,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'alice@example.com', password: 'AnotherPass1!' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/already registered/i);
  });

  it('should reject a weak password (less than 8 chars)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'bob@example.com', password: 'short' },
    });

    // Zod validation should fail -> 400
    expect(res.statusCode).toBe(400);
  });

  it('should reject an invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'StrongPass1!' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /auth/register — always-on new-signup free trial ─────────────────

describe('POST /auth/register — signup free trial', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('stamps a fresh admin_granted subscription (the trial) for a new user by default', async () => {
    const before = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'trial-user@example.com', password: 'StrongPass1!' },
    });
    expect(res.statusCode).toBe(200);
    const userId = JSON.parse(res.body).user.id;

    const sub = prisma._store.subscription.find((s) => s.userId === userId);
    expect(sub).toBeDefined();
    expect(sub).toMatchObject({ status: 'active', planType: 'admin_granted' });

    const end = new Date(sub.currentPeriodEnd).getTime();
    expect(end).toBeGreaterThan(before + 7 * DAY - 5000);
    expect(end).toBeLessThan(before + 7 * DAY + 5000);
  });

  it('stamps the trial per-user — two different signups get two independent grants', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'trial-a@example.com', password: 'StrongPass1!' },
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'trial-b@example.com', password: 'StrongPass1!' },
    });
    const userIdA = JSON.parse(res1.body).user.id;
    const userIdB = JSON.parse(res2.body).user.id;

    const subA = prisma._store.subscription.find((s) => s.userId === userIdA);
    const subB = prisma._store.subscription.find((s) => s.userId === userIdB);
    expect(subA).toBeDefined();
    expect(subB).toBeDefined();
    expect(subA.id).not.toBe(subB.id);
    expect(subA.userId).not.toBe(subB.userId);
  });

  it('grants 30 days when SIGNUP_TRIAL_PERIOD=month', async () => {
    process.env.SIGNUP_TRIAL_PERIOD = 'month';
    const before = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'trial-month@example.com', password: 'StrongPass1!' },
    });
    const userId = JSON.parse(res.body).user.id;
    const sub = prisma._store.subscription.find((s) => s.userId === userId);
    const end = new Date(sub.currentPeriodEnd).getTime();
    expect(end).toBeGreaterThan(before + 30 * DAY - 5000);
    expect(end).toBeLessThan(before + 30 * DAY + 5000);
  });

  it('grants no subscription when SIGNUP_TRIAL_ENABLED=false', async () => {
    process.env.SIGNUP_TRIAL_ENABLED = 'false';
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'trial-disabled@example.com', password: 'StrongPass1!' },
    });
    const userId = JSON.parse(res.body).user.id;
    const sub = prisma._store.subscription.find((s) => s.userId === userId);
    expect(sub).toBeUndefined();
  });

  it('still registers the user successfully even if the trial grant is disabled', async () => {
    process.env.SIGNUP_TRIAL_PERIOD = 'none';
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'trial-none@example.com', password: 'StrongPass1!' },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ─── POST /auth/login ────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(async () => {
    prisma._reset();
    const passwordHash = await hashPassword('CorrectPass1!');
    prisma._store.user.push({
      id: 'user-1',
      email: 'alice@example.com',
      passwordHash,
      role: 'user',
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('should log in with correct credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'CorrectPass1!' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('alice@example.com');

    const cookies = res.cookies;
    expect(cookies.find((c) => c.name === 'accessToken')).toBeDefined();
    expect(cookies.find((c) => c.name === 'refreshToken')).toBeDefined();
  });

  it('should reject wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'WrongPassword!' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('should reject non-existent user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'Whatever1!' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('should reject a banned user', async () => {
    prisma._store.user[0].banned = true;
    prisma._store.user[0].banReason = 'TOS violation';

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'CorrectPass1!' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/suspended/i);
  });
});

// ─── POST /auth/logout ──────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('should log out an authenticated user and clear cookies', async () => {
    // authenticate() now hydrates the user from the DB on every request,
    // so the user record must exist before the logout call.
    prisma._store.user.push({
      id: 'user-1', email: 'alice@example.com', role: 'user', banned: false,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const cookie = authCookie({ userId: 'user-1', email: 'alice@example.com', role: 'user' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('should reject unauthenticated logout', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /auth/me ────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  beforeEach(() => {
    prisma._reset();
    prisma._store.user.push({
      id: 'user-1',
      email: 'alice@example.com',
      role: 'user',
      displayName: 'Alice',
      fullName: 'Alice Smith',
      phoneNumber: null,
      educationLevel: 'graduate',
      demographicsCollected: true,
      banned: false,
      banReason: null,
      subscriptions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('should return current user profile for authenticated request', async () => {
    // Make user.findUnique return the user with subscriptions included
    prisma.user.findUnique = vi.fn(async () => ({
      ...prisma._store.user[0],
      subscriptions: [],
    }));
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);

    const cookie = authCookie({ userId: 'user-1', email: 'alice@example.com', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe('alice@example.com');
    expect(body.display_name).toBe('Alice');
    expect(body.entitlements).toBeDefined();
    expect(body.entitlements.isPremium).toBe(false);
  });

  it('should return 401 for unauthenticated request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });

    expect(res.statusCode).toBe(401);
  });

  it('falls back to a valid refresh token when the access token is absent/expired', async () => {
    // No access cookie, only a session-matched refresh token. The old behavior
    // 401'd here (the SPA then silently refreshed + retried, logging a spurious
    // `401 ()` on every return visit). /auth/me now mints a fresh access token
    // inline and returns 200 — killing the console error at the source.
    prisma.user.findUnique = vi.fn(async ({ where }) => {
      const u = prisma._store.user.find((r) => r.id === where.id) || null;
      return u ? { ...u, subscriptions: [] } : null;
    });
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);

    const cookie = await refreshOnlyCookie(prisma, 'user-1');

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe('alice@example.com');

    // A fresh access-token cookie is issued so subsequent requests authenticate
    // normally without another refresh round-trip.
    const accessCookie = res.cookies.find((c) => c.name === 'accessToken');
    expect(accessCookie).toBeDefined();
    expect(accessCookie.value).toBeTruthy();
  });

  it('still 401s when neither a valid access nor refresh token is present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: 'refreshToken=garbage.not.valid' },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── PUT /auth/me ────────────────────────────────────────────────────────────

describe('PUT /auth/me', () => {
  beforeEach(() => {
    prisma._reset();
    prisma._store.user.push({
      id: 'user-1',
      email: 'alice@example.com',
      role: 'user',
      displayName: 'Alice',
      fullName: null,
      phoneNumber: null,
      educationLevel: null,
      demographicsCollected: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('should update profile fields', async () => {
    const cookie = authCookie({ userId: 'user-1', email: 'alice@example.com', role: 'user' });

    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me',
      headers: { cookie },
      payload: {
        displayName: 'Alice Updated',
        fullName: 'Alice B. Smith',
        educationLevel: 'phd',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.display_name).toBe('Alice Updated');
    expect(body.full_name).toBe('Alice B. Smith');
    expect(body.education_level).toBe('phd');
  });

  it('should reject unauthenticated update', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me',
      payload: { displayName: 'Hacker' },
    });

    expect(res.statusCode).toBe(401);
  });
});
