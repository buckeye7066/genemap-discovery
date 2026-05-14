// Sets test-only env vars BEFORE any module imports run.
// This file has no imports of its own, so its top-level assignments
// execute immediately and are visible to every other module that
// vitest's setupFiles or test files load afterwards (those modules
// hoist their imports, but this file does not import anything).

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-also-at-least-32-chars-long';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'test-cookie-secret-at-least-32-chars-long-please';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
// Tests intentionally do NOT set MEDICAL_DATA_ENCRYPTION_KEY by default;
// individual tests opt-in to verify both fail-closed (production) and
// fail-open (development) behaviour.
