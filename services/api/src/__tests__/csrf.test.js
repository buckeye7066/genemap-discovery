import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';

let app;
let prisma;

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => prisma._reset());

describe('CSRF middleware', () => {
  it('allows safe (GET) requests without a CSRF token', async () => {
    prisma._store.user.push({
      id: 'u1', email: 'u@x.com', role: 'user', subscriptions: [],
      banned: false, demographicsCollected: false,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: authCookie({ userId: 'u1', email: 'u@x.com', role: 'user' }) },
    });
    expect(res.statusCode).toBe(200);
    // /auth/me must mint a csrfToken cookie for the SPA
    const cookies = res.cookies.map((c) => c.name);
    expect(cookies).toContain('csrfToken');
  });

  it('rejects a state-changing request with a session cookie but no CSRF', async () => {
    const cookie = authCookie({ userId: 'u1', email: 'u@x.com', role: 'user' });
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me',
      headers: { cookie },
      payload: { displayName: 'Bad' },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/csrf/i);
  });

  it('rejects when cookie and header CSRF tokens differ', async () => {
    const session = authCookie({ userId: 'u1', email: 'u@x.com', role: 'user' });
    const cookie = `${session}; csrfToken=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me',
      headers: { cookie, 'x-csrf-token': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      payload: { displayName: 'Bad' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts when cookie and header CSRF tokens match', async () => {
    prisma._store.user.push({
      id: 'u1', email: 'u@x.com', role: 'user', displayName: 'Old',
      banned: false, demographicsCollected: false,
    });
    const csrf = 'cccccccccccccccccccccccccccccccccccccc';
    const session = authCookie({ userId: 'u1', email: 'u@x.com', role: 'user' });
    const cookie = `${session}; csrfToken=${csrf}`;
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { displayName: 'New' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('does not require CSRF on /auth/login (no session yet)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'noone@x.com', password: 'WrongPass1!' },
    });
    // 401 (bad credentials) — not 403 (CSRF)
    expect(res.statusCode).toBe(401);
  });
});
