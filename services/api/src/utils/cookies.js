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
 * Returns the path-only options used for clearing cookies. We pass back
 * the same domain that was used to set them so `clearCookie` actually
 * matches in cross-origin deployments.
 */
export function getClearCookieOptions() {
  return {
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
  };
}
