import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import accountRoutes from '../routes/account.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { hashPassword } from '../utils/auth.js';
import { authCookie, createPrismaMock } from './setup.js';

const identity = {
  userId: 'account-route-user',
  email: 'account-route@example.invalid',
  role: 'user',
};

describe('POST /account/delete', () => {
  let app;
  let prisma;
  let password;

  beforeEach(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    prisma = createPrismaMock();
    password = 'DeleteMe!234';
    prisma._store.user.push({
      id: identity.userId,
      email: identity.email,
      role: identity.role,
      passwordHash: await hashPassword(password),
      banned: false,
    });

    app = Fastify({ logger: false });
    app.decorate('prisma', prisma);
    await app.register(cookie, { secret: process.env.COOKIE_SECRET });
    app.setErrorHandler(errorHandler);
    await app.register(accountRoutes, { prefix: '/account' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  function request(payload, actor = identity) {
    return app.inject({
      method: 'POST',
      url: '/account/delete',
      headers: { cookie: authCookie(actor, prisma) },
      payload,
    });
  }

  it('requires the current account email and current password', async () => {
    const wrongEmail = await request({
      email: 'someone-else@example.invalid',
      password,
      confirmation: 'DELETE MY ACCOUNT',
    });
    expect(wrongEmail.statusCode).toBe(400);
    expect(JSON.parse(wrongEmail.payload).error).toMatch(/email address currently assigned/i);

    const wrongPassword = await request({
      email: identity.email,
      password: 'wrong-password',
      confirmation: 'DELETE MY ACCOUNT',
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(JSON.parse(wrongPassword.payload).error).toMatch(/password confirmation failed/i);
    expect(prisma._store.user).toHaveLength(1);
  });

  it('requires the exact destructive confirmation phrase', async () => {
    const response = await request({
      email: identity.email,
      password,
      confirmation: 'DELETE',
    });

    expect(response.statusCode).toBe(400);
    expect(prisma._store.user).toHaveLength(1);
  });

  it('deletes the account, returns a receipt, and clears all session cookies', async () => {
    const response = await request({
      email: identity.email,
      password,
      confirmation: 'DELETE MY ACCOUNT',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toMatchObject({
      success: true,
      receiptId: expect.any(String),
      billing: { subscriptionsCancelled: 0, customersDeleted: 0 },
    });
    expect(prisma._store.user).toHaveLength(0);

    const cookies = response.headers['set-cookie'];
    const serialized = Array.isArray(cookies) ? cookies.join('\n') : String(cookies || '');
    expect(serialized).toContain('accessToken=');
    expect(serialized).toContain('refreshToken=');
    expect(serialized).toContain('csrfToken=');
  });

  it('does not permit a super administrator to erase the last control-plane identity', async () => {
    prisma._store.user[0].role = 'super_admin';
    const response = await request({
      email: identity.email,
      password,
      confirmation: 'DELETE MY ACCOUNT',
    }, { ...identity, role: 'super_admin' });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload).error).toMatch(/super administrator account must be transferred/i);
    expect(prisma._store.user).toHaveLength(1);
  });
});
