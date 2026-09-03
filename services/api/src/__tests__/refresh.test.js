import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, createPrismaMock } from './setup.js';
import {
  hashPassword,
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshTokenHash,
} from '../utils/auth.js';

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
  prisma.session.create.mockClear();
  prisma.session.deleteMany.mockClear();
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
  it('hashes the complete refresh token instead of bcrypt-truncating its shared prefix', async () => {
    // This is the exact condition that makes bcrypt unsafe for long JWT
    // storage: distinct credentials can share all 72 bytes bcrypt retains.
    const sharedJwtPrefix = 'x'.repeat(72);
    const first = `${sharedJwtPrefix}.first-rotation`;
    const second = `${sharedJwtPrefix}.second-rotation`;
    expect(first).not.toBe(second);
    expect(first.slice(0, 72)).toBe(second.slice(0, 72));

    const firstHash = await hashRefreshToken(first);
    const secondHash = await hashRefreshToken(second);
    expect(firstHash).toMatch(/^hmac-sha256:[a-f0-9]{64}$/);
    expect(secondHash).not.toBe(firstHash);
    expect(await verifyRefreshTokenHash(first, firstHash)).toBe(true);
    expect(await verifyRefreshTokenHash(second, firstHash)).toBe(false);

    const unsafeLegacyBcryptHash = await hashPassword(first);
    expect(await verifyRefreshTokenHash(first, unsafeLegacyBcryptHash)).toBe(false);
    expect(await verifyRefreshTokenHash(first, 'unsupported-format')).toBe(false);
  });

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

  it('rejects reuse of the consumed refresh token without creating another session', async () => {
    const refreshToken = await seedSession();
    const first = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${refreshToken}` },
    });
    expect(first.statusCode).toBe(200);
    const rotatedRefresh = first.cookies.find((cookie) => cookie.name === 'refreshToken');
    expect(rotatedRefresh?.value).toBeTruthy();
    expect(rotatedRefresh.value).not.toBe(refreshToken);
    expect(prisma._store.session).toHaveLength(1);
    expect(
      await verifyRefreshTokenHash(refreshToken, prisma._store.session[0].refreshTokenHash)
    ).toBe(false);

    const reused = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${refreshToken}` },
    });
    expect(reused.statusCode).toBe(401);
    expect(prisma._store.session).toHaveLength(1);
  });

  it('does not mint a replacement when another request already consumed the session', async () => {
    const refreshToken = await seedSession();
    prisma.session.deleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${refreshToken}` },
    });

    expect(res.statusCode).toBe(401);
    expect(prisma.session.create).not.toHaveBeenCalled();
    expect(res.cookies.map((cookie) => cookie.name)).toEqual(expect.arrayContaining([
      'accessToken',
      'refreshToken',
      'csrfToken',
    ]));
  });

  it('rolls consumption back when the replacement session cannot be persisted', async () => {
    const refreshToken = await seedSession();
    const originalHash = prisma._store.session[0].refreshTokenHash;
    prisma.session.create.mockRejectedValueOnce(new Error('session storage unavailable'));

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: `refreshToken=${refreshToken}` },
    });

    expect(res.statusCode).toBe(500);
    expect(prisma._store.session).toHaveLength(1);
    expect(prisma._store.session[0].refreshTokenHash).toBe(originalHash);
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
