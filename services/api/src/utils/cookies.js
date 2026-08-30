/**
 * Cookie option helpers.
 *
 * Centralises auth/CSRF cookie defaults so the same SameSite / Secure /
 * Domain rules apply everywhere. Production deployments that host the API
 * and the web app on different origins MUST set:
 *
 *   NODE_ENV=production
 *   CROSS_ORIGIN_COOKIES=true        // emits SameSite=None; Secure
 *   COOKIE_DOMAIN=.example.com       // optional, scoped subdomain sharing
 *
 * In dev/test we default to SameSite=Lax, Secure=false so cookies survive
 * `localhost` HTTP traffic and Fastify's `inject()` test harness.
 */

const isProd = () => process.env.NODE_ENV === 'production';
const crossOrigin = () => process.env.CROSS_ORIGIN_COOKIES === 'true';

function baseOptions() {
  return {
    secure: isProd(),
    sameSite: crossOrigin() ? 'none' : 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  };
}

/**
 * Options for httpOnly auth cookies (accessToken / refreshToken).
 * Pass `{ maxAge }` in seconds.
 */
export function getAuthCookieOptions({ maxAge } = {}) {
  return {
    ...baseOptions(),
    httpOnly: true,
    maxAge,
  };
}

/**
 * Options for the CSRF double-submit cookie.
 * Must NOT be httpOnly so the SPA can read it and echo it as a header.
 */
export function getCsrfCookieOptions({ maxAge } = {}) {
  return {
    ...baseOptions(),
    httpOnly: false,
    maxAge,
  };
}

/**
 * Options for CLEARING a cookie.
 *
 * A browser only removes a cookie when the clearing `Set-Cookie` matches the
 * attributes it was SET with. This returned `{ path, domain }` only — no
 * `secure`, no `sameSite` — so on the cross-origin production deployment
 * (web on Vercel, API on Railway, cookies issued `SameSite=None; Secure`)
 * the clear did not match and the browser KEPT the session.
 *
 * Measured live 2026-08-19 against production: clicking "Sign Out" produced
 * `POST /auth/logout -> 200`, and afterwards the browser still held
 * accessToken, refreshToken AND csrfToken, with `GET /auth/me` still
 * returning 200. The server said it logged you out and you stayed logged in
 * — on a shared device the next person has the account.
 *
 * It therefore mirrors baseOptions() exactly. `maxAge`/`expires` are set by
 * fastify-cookie's clearCookie itself and must not be supplied here.
 */
export function getClearCookieOptions() {
  return {
    ...baseOptions(),
    secure: isProd(),
    sameSite: crossOrigin() ? 'none' : 'lax',
  };
}
