/**
 * firstLoginNotifier.js — one-time "a new user just signed in for the first
 * time" owner notification.
 *
 * Called (fire-and-forget) from every successful sign-in path in
 * routes/auth.js: password login and registration auto-login (token refresh is
 * not a sign-in). It stamps users.last_login_at on EVERY sign-in; the NULL→set
 * transition is the first-login signal that emails the owner. Existing users
 * were backfilled at migration time, so only accounts created after this
 * feature can transition.
 *
 * Mirrors errorReporter.js conventions: never throws, never blocks the
 * request, admin/owner sign-ins never notify, recipient defaults to the owner.
 *
 * Env:
 *   FIRST_LOGIN_REPORT_EMAIL — recipient override
 *   ERROR_REPORT_EMAIL       — shared owner-notification fallback
 *   ADMIN_EMAILS             — excluded senders (plus the hardcoded owner)
 */

import { sendEmail as sendEmailReal } from './email.js';

const OWNER_EMAIL = 'buckeye7066@gmail.com';
const DEFAULT_RECIPIENT = 'dr.johnwhite@axiombiolabs.org';
const APP_NAME = 'GeneMap';

function isExcludedEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  if (e === OWNER_EMAIL) return true;
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(e);
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Stamp last_login_at and, when this was the user's FIRST sign-in, email the
 * owner. Returns a promise (awaitable in tests); route callers invoke it
 * fire-and-forget (`void recordSuccessfulLogin(...)`) so sign-in latency and
 * outcome are never affected — all failures are swallowed after a log line.
 *
 * @param {object} args
 * @param {object} args.prisma   Prisma client
 * @param {object} args.user     the just-authenticated user row (pre-stamp)
 * @param {string} [args.method] 'login' | 'register'
 * @param {object} [args.deps]   injectable { sendEmail } for tests
 */
export async function recordSuccessfulLogin({ prisma, user, method = 'login', deps = {} } = {}) {
  const sendEmail = deps.sendEmail || sendEmailReal;
  try {
    if (!prisma?.user?.update || !user?.id) return { skipped: true };

    const firstLogin = !user.lastLoginAt;
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    if (!firstLogin) return { ok: true, firstLogin: false };
    if (isExcludedEmail(user.email)) return { ok: true, firstLogin: true, notified: false };

    const to = process.env.FIRST_LOGIN_REPORT_EMAIL
      || process.env.ERROR_REPORT_EMAIL
      || DEFAULT_RECIPIENT;
    const when = new Date().toISOString();
    const name = user.fullName || '(no name)';
    const subject = `[${APP_NAME}] New user first login: ${user.email}`;
    const text = [
      `A new user just signed in to ${APP_NAME} for the first time.`,
      '',
      `Email:  ${user.email}`,
      `Name:   ${name}`,
      `Via:    ${method}`,
      `When:   ${when}`,
      `UserId: ${user.id}`,
    ].join('\n');
    const html = `
      <h2 style="margin:0 0 12px">New ${APP_NAME} user — first login</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td>${escapeHtml(user.email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Name</td><td>${escapeHtml(name)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Via</td><td>${escapeHtml(method)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">When</td><td>${escapeHtml(when)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">User id</td><td>${escapeHtml(user.id)}</td></tr>
      </table>`;

    const result = await sendEmail({ to, subject, html, text });
    return { ok: true, firstLogin: true, notified: Boolean(result?.ok || result?.id) };
  } catch (err) {
    console.warn('[firstLoginNotifier] failed (non-fatal):', err?.message || err);
    return { ok: false, error: err?.message };
  }
}

export default { recordSuccessfulLogin };
