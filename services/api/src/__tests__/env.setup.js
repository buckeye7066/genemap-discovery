/**
 * Pre-import environment setup for tests.
 *
 * This file MUST appear BEFORE `setup.js` in vitest's `setupFiles`
 * configuration. It contains no imports, so its inline statements run
 * before the rest of the test setup begins resolving its own ESM imports
 * (notably `../routes/auth.js` and `../utils/auth.js` which validate
 * JWT_SECRET / JWT_REFRESH_SECRET at module load time).
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-long-enough';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-that-is-long-enough';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'test-cookie-secret';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || '*';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
