import { describe, it, expect } from 'vitest';
import { isRetryableRequest } from '../services/genomicDatabases.js';

/**
 * Transient-retry safety invariant: the shared fetchJSON helper must only ever
 * retry idempotent requests. Retrying a non-idempotent method (POST/PUT/PATCH/
 * DELETE) risks double-applying a write on a transient 502/503/504 or network
 * blip. GET/HEAD are safe; a caller that KNOWS its non-GET request is a pure
 * read may opt back in with `idempotent: true`.
 */
describe('fetchJSON retry idempotency guard', () => {
  it('retries GET (default method) and HEAD', () => {
    expect(isRetryableRequest(undefined)).toBe(true);
    expect(isRetryableRequest('GET')).toBe(true);
    expect(isRetryableRequest('get')).toBe(true);
    expect(isRetryableRequest('HEAD')).toBe(true);
  });

  it('never retries writes', () => {
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(isRetryableRequest(verb)).toBe(false);
    }
  });

  it('honors an explicit idempotent opt-in for a known-safe non-GET read', () => {
    expect(isRetryableRequest('POST', { idempotent: true })).toBe(true);
  });

  it('does not treat a falsy idempotent flag as opt-in', () => {
    expect(isRetryableRequest('POST', { idempotent: false })).toBe(false);
    expect(isRetryableRequest('POST', {})).toBe(false);
  });
});
