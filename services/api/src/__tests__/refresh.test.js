import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, createPrismaMock } from './setup.js';
import { hashPassword, generateRefreshToken, hashRefreshToken } from '../utils/auth.js';

let app;
let prisma;

beforeAll(async () => {
  prisma = createPrismaMock();
  // Disable CSRF for this suite — we are testing refresh on its own.
  app = await buildTestApp(prisma, { csrf: false });
});

afterAll(async () => app.close());

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

async function seedSession() {
  const refreshToken = generateRefreshToken({ userId: 'user-1' });
  const refreshTokenHash = await hashRefreshToken(refreshToken);
  prisma._store.session.push({
    id: 'sess-1',
    userId: 'user-1',
    refreshTokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return refreshToken;
}

describe('POST /auth/refresh', () => {
  it('rejects with 401 when no refresh cookie is present', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: 'refreshToken=not-a-jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects when token is valid but no matching session row exists', async () => {
    const refreshToken = generateRefreshToken({ userId: 'user-1' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${refreshToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rotates the refresh token on success and issues a new access cookie', async () => {
    const refreshToken = await seedSession();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${refreshToken}` },
    });
    expect(res.statusCode).toBe(200);
    const cookies = res.cookies;
    const access = cookies.find((c) => c.name === 'accessToken');
    const newRefresh = cookies.find((c) => c.name === 'refreshToken');
    expect(access).toBeDefined();
    expect(newRefresh).toBeDefined();
    expect(newRefresh.value).not.toBe(refreshToken);

    // Used session should be removed and replaced.
    const sessions = prisma._store.session;
    expect(sessions.length).toBe(1);
    expect(sessions[0].refreshTokenHash).not.toBe(refreshToken);
  });

  it('rejects when the user is banned', async () => {
    const refreshToken = await seedSession();
    prisma._store.user[0].banned = true;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${refreshToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
