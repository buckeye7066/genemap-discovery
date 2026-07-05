/**
 * firstLoginNotifier — the one-time "new user just signed in for the first
 * time" owner email. Contract:
 *   1. NULL→set transition of lastLoginAt sends exactly one owner email.
 *   2. Subsequent logins re-stamp lastLoginAt but never re-notify.
 *   3. Admin (ADMIN_EMAILS) / owner sign-ins are stamped but NEVER notify.
 *   4. Recipient: FIRST_LOGIN_REPORT_EMAIL > ERROR_REPORT_EMAIL > owner default.
 *   5. The helper never throws (fire-and-forget safety).
 *
 * The email sender is dependency-injected (deps.sendEmail) so the test never
 * touches the real Resend client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPrismaMock } from './setup.js';
import { recordSuccessfulLogin } from '../services/firstLoginNotifier.js';

describe('firstLoginNotifier.recordSuccessfulLogin', () => {
  let prisma;
  let sendEmail;
  const envKeys = ['FIRST_LOGIN_REPORT_EMAIL', 'ERROR_REPORT_EMAIL', 'ADMIN_EMAILS'];
  const savedEnv = {};

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma._reset();
    sendEmail = vi.fn(async () => ({ ok: true, id: 'em_test' }));
    for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  const call = (args) => recordSuccessfulLogin({ prisma, deps: { sendEmail }, ...args });

  function seedUser(over = {}) {
    const user = {
      id: 'u1', email: 'newbie@example.com', fullName: 'Newbie',
      lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(),
      ...over,
    };
    prisma._store.user.push(user);
    return user;
  }

  it('first login stamps lastLoginAt and emails the owner default recipient', async () => {
    const user = seedUser();
    const res = await call({ user, method: 'login' });

    expect(res).toMatchObject({ ok: true, firstLogin: true, notified: true });
    expect(prisma._store.user[0].lastLoginAt).toBeInstanceOf(Date);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const args = sendEmail.mock.calls[0][0];
    expect(args.to).toBe('dr.johnwhite@axiombiolabs.org');
    expect(args.subject).toContain('newbie@example.com');
    expect(args.subject).toContain('GeneMap');
  });

  it('a repeat login re-stamps but does NOT notify', async () => {
    const user = seedUser({ lastLoginAt: new Date('2026-07-01T00:00:00Z') });
    const res = await call({ user });

    expect(res).toMatchObject({ ok: true, firstLogin: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma._store.user[0].lastLoginAt.getTime()).toBeGreaterThan(Date.parse('2026-07-01'));
  });

  it('admin (ADMIN_EMAILS) and owner sign-ins never notify', async () => {
    process.env.ADMIN_EMAILS = 'Admin@Example.com';
    const admin = seedUser({ id: 'a1', email: 'admin@example.com' });
    expect(await call({ user: admin })).toMatchObject({ firstLogin: true, notified: false });

    const owner = seedUser({ id: 'o1', email: 'buckeye7066@gmail.com' });
    expect(await call({ user: owner })).toMatchObject({ firstLogin: true, notified: false });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma._store.user.find((u) => u.id === 'a1').lastLoginAt).toBeInstanceOf(Date);
  });

  it('recipient override order: FIRST_LOGIN_REPORT_EMAIL > ERROR_REPORT_EMAIL', async () => {
    process.env.ERROR_REPORT_EMAIL = 'errors@example.com';
    await call({ user: seedUser({ id: 'u2', email: 'a@b.com' }) });
    expect(sendEmail.mock.calls[0][0].to).toBe('errors@example.com');

    process.env.FIRST_LOGIN_REPORT_EMAIL = 'firstlogins@example.com';
    await call({ user: seedUser({ id: 'u3', email: 'c@d.com' }) });
    expect(sendEmail.mock.calls[1][0].to).toBe('firstlogins@example.com');
  });

  it('never throws — degraded inputs and a throwing sender are swallowed', async () => {
    expect(await call({ user: null })).toMatchObject({ skipped: true });
    expect(await recordSuccessfulLogin({})).toMatchObject({ skipped: true });

    sendEmail.mockRejectedValueOnce(new Error('resend down'));
    const res = await call({ user: seedUser({ id: 'u9', email: 'x@y.com' }) });
    expect(res.ok).toBe(false); // reported, not thrown
  });
});
