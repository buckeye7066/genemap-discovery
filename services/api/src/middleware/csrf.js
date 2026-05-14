/**
 * Double-submit-cookie CSRF protection for cookie-authenticated endpoints.
 *
 * Pattern:
 *  - On first response from an authenticated GET /auth/me (or any GET passing
 *    through `attachCsrfToken`), the server sets a NON-HttpOnly cookie
 *    `csrfToken` containing a random value.
 *  - The browser-side client reads the cookie and echoes the value in the
 *    `x-csrf-token` request header on every state-changing request.
 *  - `requireCsrf` rejects requests where the cookie and header do not match
 *    using a constant-time comparison.
 *
 * Why this design:
 *  - Works with cross-origin SPA + cookie auth without server-side session
 *    state; no DB lookup per request.
 *  - SameSite=lax already mitigates many CSRF cases, but is not sufficient
 *    for cross-site POSTs from sub-domains or when browsers interpret SameSite
 *    permissively. Double-submit closes that gap.
 */

import crypto from 'crypto';

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Idempotently ensures a csrfToken cookie exists on the response. Safe to
 * call from any handler. The cookie is intentionally NOT HttpOnly so the
 * SPA can read and re-submit it.
 */
export function ensureCsrfCookie(request, reply) {
  const existing = request.cookies?.[CSRF_COOKIE];
  if (existing && existing.length >= 32) return existing;

  const token = newToken();
  const isProd = process.env.NODE_ENV === 'production';
  reply.setCookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24h
  });
  return token;
}

/**
 * preHandler that rejects state-changing requests when cookie/header
 * CSRF tokens disagree. Skips safe methods and the Stripe webhook (which
 * uses signature verification of the raw body instead).
 */
export async function requireCsrf(request, reply) {
  if (SAFE_METHODS.has(request.method)) return;

  // Stripe webhook authenticates via signature header on raw body.
  if (request.url.startsWith('/billing/webhook')) return;

  // Login/register/refresh do not have a session yet, so cannot have
  // received a CSRF token. They are still rate-limited and CORS-restricted.
  if (request.url.startsWith('/auth/login') ||
      request.url.startsWith('/auth/register') ||
      request.url.startsWith('/auth/refresh')) {
    return;
  }

  // Only enforce when the request actually carries a session cookie —
  // bearer-token / API-key clients (none today, but reserved) bypass CSRF.
  const hasSessionCookie = Boolean(request.cookies?.accessToken || request.cookies?.refreshToken);
  if (!hasSessionCookie) return;

  const cookieToken = request.cookies?.[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || !constantTimeEqual(cookieToken, headerToken)) {
    reply.code(403).send({ error: 'CSRF token missing or invalid' });
    return reply;
  }
}

export const CSRF_CONSTANTS = { CSRF_COOKIE, CSRF_HEADER };
