import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from './setup.js';
import { recordSuccessfulLogin } from '../services/firstLoginNotifier.js';

describe('firstLoginNotifier.recordSuccessfulLogin', () => {
  let prisma;
  let sendEmail;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma._reset();
    sendEmail = vi.fn();
  });

  function seedUser(overrides = {}) {
    const user = {
      id: 'u1',
      email: 'private@example.invalid',
      fullName: 'Private User',
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    prisma._store.user.push(user);
    return user;
  }

  it('stamps a first login without exporting identity', async () => {
    const user = seedUser();
    const result = await recordSuccessfulLogin({
      prisma,
      user,
      method: 'register',
      deps: { sendEmail },
    });

    expect(result).toMatchObject({ ok: true, firstLogin: true, notified: false });
    expect(prisma._store.user[0].lastLoginAt).toBeInstanceOf(Date);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('re-stamps a repeat login without any notification', async () => {
    const user = seedUser({ lastLoginAt: new Date('2026-07-01T00:00:00Z') });
    const result = await recordSuccessfulLogin({ prisma, user, deps: { sendEmail } });

    expect(result).toMatchObject({ ok: true, firstLogin: false, notified: false });
    expect(prisma._store.user[0].lastLoginAt.getTime()).toBeGreaterThan(Date.parse('2026-07-01'));
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('never throws for missing input or a database failure', async () => {
    expect(await recordSuccessfulLogin({})).toMatchObject({ skipped: true });

    const user = seedUser();
    prisma.user.update = vi.fn().mockRejectedValue(new Error('database canary'));
    await expect(recordSuccessfulLogin({ prisma, user })).resolves.toMatchObject({ ok: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
