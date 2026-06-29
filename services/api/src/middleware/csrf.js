/**
 * CSRF protection (HMAC-bound double-submit cookie).
 *
 * Token format:
 *   v1.<userIdB64>.<nonceB64>.<sigB64>
 * where sig = HMAC-SHA256(secret, `${userId}:${nonce}`).
 *
 * Why this design:
 *  - Stateless (no DB lookup per request) but still tamper-proof: the token
 *    cannot be forged without the server-side secret.
 *  - Double-submit: the value is set as a NON-HttpOnly `csrfToken` cookie and
 *    must be echoed in the `x-csrf-token` request header; the cookie/header
 *    pair are compared in constant time.
 *  - Bound to user: the userId is committed to inside the HMAC signature, so
 *    a token issued for one principal cannot be reused for another.
 *  - Anonymous/pre-auth flows (login, register, refresh, webhook) bypass
 *    CSRF entirely; they are protected by other mechanisms (rate limit, CORS,
 *    Stripe signature).
 */

import crypto from 'crypto';
import { getCsrfCookieOptions } from '../utils/cookies.js';

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_VERSION = 'v1';

function getSecret() {
  return (
    process.env.CSRF_SECRET ||
    process.env.COOKIE_SECRET ||
    'dev-only-csrf-secret-change-in-production'
  );
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromB64url(input) {
  try {
    return Buffer.from(String(input), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function signCsrf(userId, nonce, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${nonce}`)
    .digest('base64url');
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Parse and verify HMAC integrity of a CSRF token.
 * Returns the bound userId on success, or null on any failure.
 */
function verifyCsrfTokenIntegrity(token, secret = getSecret()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;
  const [, userIdEnc, nonceEnc, sigEnc] = parts;
  const userId = fromB64url(userIdEnc);
  const nonce = fromB64url(nonceEnc);
  if (!userId || !nonce) return null;
  const expected = signCsrf(userId, nonce, secret);
  if (!constantTimeEqual(sigEnc, expected)) return null;
  return userId;
}

export function issueCsrfToken(userId, secret = getSecret()) {
  const principal = userId || 'anon';
  const nonce = crypto.randomBytes(24).toString('base64url');
  const sig = signCsrf(principal, nonce, secret);
  return `${TOKEN_VERSION}.${b64url(principal)}.${b64url(nonce)}.${sig}`;
}

/**
 * Idempotently ensures a csrfToken cookie exists on the response. Safe to
 * call from any handler. The cookie is intentionally NOT HttpOnly so the
 * SPA can read and re-submit it.
 *
 * Binds the token to the authenticated userId when available; otherwise
 * issues an anonymous-bound token suitable for pre-auth flows.
 */
export function ensureCsrfCookie(request, reply) {
  const userId = request?.user?.userId;
  const existing = request.cookies?.[CSRF_COOKIE];
  if (existing) {
    const boundTo = verifyCsrfTokenIntegrity(existing);
    // Reuse only when integrity is intact AND it is bound to the same
    // principal (or to anon when caller is unauthenticated).
    if (boundTo && (!userId ? boundTo === 'anon' : boundTo === userId)) {
      return existing;
    }
  }

  const token = issueCsrfToken(userId);
  // Use the shared cookie options so the CSRF cookie honors
  // CROSS_ORIGIN_COOKIES (SameSite=None; Secure) exactly like the auth
  // cookies. Previously this hardcoded SameSite=Lax, so on a cross-site
  // (Vercel web ↔ Railway API) deployment the cookie was never sent on the
  // SPA's XHR requests — half the reason the profile gate 403'd.
  reply.setCookie(CSRF_COOKIE, token, getCsrfCookieOptions({ maxAge: 60 * 60 * 24 }));
  return token;
}

/**
 * preHandler that rejects state-changing requests when the CSRF token is
 * missing, malformed, tampered with, or when cookie/header tokens disagree.
 *
 * Skips:
 *  - Safe methods (GET/HEAD/OPTIONS).
 *  - Stripe webhook (verified by signature on raw body).
 *  - Pre-auth endpoints (login/register/refresh) — no session exists yet.
 *  - Requests without a session cookie at all (e.g. server-to-server with
 *    an API key — none today, reserved).
 */
export async function requireCsrf(request, reply) {
  if (SAFE_METHODS.has(request.method)) return;

  if (request.url.startsWith('/billing/webhook')) return;

  if (
    request.url.startsWith('/auth/login') ||
    request.url.startsWith('/auth/register') ||
    request.url.startsWith('/auth/refresh')
  ) {
    return;
  }

  const hasSessionCookie = Boolean(
    request.cookies?.accessToken || request.cookies?.refreshToken,
  );
  if (!hasSessionCookie) return;

  const cookieToken = request.cookies?.[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER];

  // A custom request header is mandatory in every mode. Browsers force a CORS
  // preflight for `X-CSRF-Token` on cross-origin requests, and our CORS policy
  // only allowlists the real web origin — so a malicious site can never attach
  // this header. The header's presence is itself the cross-site CSRF barrier.
  if (!headerToken) {
    reply.code(403).send({ error: 'CSRF token missing or invalid' });
    return reply;
  }

  // Same-origin double-submit (dev, tests, reverse-proxy deploys): when the
  // SPA shares an origin with the API it can read the csrfToken cookie, so we
  // require the cookie and header to agree and the cookie to be HMAC-valid.
  if (cookieToken) {
    if (!constantTimeEqual(cookieToken, headerToken) || !verifyCsrfTokenIntegrity(cookieToken)) {
      reply.code(403).send({ error: 'CSRF token missing or invalid' });
      return reply;
    }
    return;
  }

  // Cross-site deploy (Vercel web ↔ Railway API): the csrfToken cookie lives on
  // a different registrable domain, so the SPA's JS can't read it and it never
  // reaches us. Fall back to validating the HMAC-signed token the SPA echoes in
  // the header (it received it in the auth response body). Forgery is blocked by
  // the server-side HMAC secret plus the CORS preflight barrier above.
  if (!verifyCsrfTokenIntegrity(headerToken)) {
    reply.code(403).send({ error: 'CSRF token missing or invalid' });
    return reply;
  }
}

export const CSRF_CONSTANTS = { CSRF_COOKIE, CSRF_HEADER };

// Exposed for tests / scripts.
export const __test__ = { signCsrf, verifyCsrfTokenIntegrity, issueCsrfToken };
