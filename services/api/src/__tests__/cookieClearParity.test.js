import { afterEach, describe, expect, it } from 'vitest';
import {
  getAuthCookieOptions,
  getCsrfCookieOptions,
  getClearCookieOptions,
} from '../utils/cookies.js';

/**
 * A browser removes a cookie only when the clearing Set-Cookie matches the
 * attributes it was SET with. getClearCookieOptions() used to return just
 * { path, domain } — no secure, no sameSite — so on the cross-origin
 * production deployment (web on Vercel, API on Railway, cookies issued
 * SameSite=None; Secure) the clear silently did not match and the session
 * survived a "Sign Out".
 */
const withEnv = (vars, fn) => {
  const prior = {};
  for (const [k, v] of Object.entries(vars)) { prior[k] = process.env[k]; process.env[k] = v; }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
};

afterEach(() => { delete process.env.CROSS_ORIGIN_COOKIES; });

describe('cookie clear/set attribute parity', () => {
  it('matches the auth cookie attributes in a cross-origin production deploy', () => {
    withEnv({ NODE_ENV: 'production', CROSS_ORIGIN_COOKIES: 'true' }, () => {
      const set = getAuthCookieOptions({ maxAge: 900 });
      const clear = getClearCookieOptions();
      expect(clear.secure).toBe(set.secure);
      expect(clear.sameSite).toBe(set.sameSite);
      expect(clear.path).toBe(set.path);
      expect(clear.domain).toBe(set.domain);
      // The exact production shape that broke it.
      expect(clear.secure).toBe(true);
      expect(clear.sameSite).toBe('none');
    });
  });

  it('matches the CSRF cookie attributes too', () => {
    withEnv({ NODE_ENV: 'production', CROSS_ORIGIN_COOKIES: 'true' }, () => {
      const set = getCsrfCookieOptions({ maxAge: 900 });
      const clear = getClearCookieOptions();
      expect(clear.secure).toBe(set.secure);
      expect(clear.sameSite).toBe(set.sameSite);
    });
  });

  it('still matches in the same-origin/dev shape', () => {
    withEnv({ NODE_ENV: 'test' }, () => {
      const set = getAuthCookieOptions({ maxAge: 900 });
      const clear = getClearCookieOptions();
      expect(clear.secure).toBe(set.secure);
      expect(clear.sameSite).toBe(set.sameSite);
    });
  });

  it('never carries maxAge/expires — clearCookie owns those', () => {
    const clear = getClearCookieOptions();
    expect(clear.maxAge).toBeUndefined();
    expect(clear.expires).toBeUndefined();
  });
});
