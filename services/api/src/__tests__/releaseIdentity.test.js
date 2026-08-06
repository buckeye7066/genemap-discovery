import { describe, expect, it } from 'vitest';
import { resolveRailwayReleaseSha } from '../config/releaseIdentity.js';

describe('Railway release identity', () => {
  it('accepts the provider-issued immutable Git SHA', () => {
    const sha = 'a'.repeat(40);
    expect(resolveRailwayReleaseSha(
      { NODE_ENV: 'production', RAILWAY_GIT_COMMIT_SHA: sha },
      { production: true }
    )).toBe(sha);
  });

  it.each([
    ['missing', undefined],
    ['short', 'abc123'],
    ['non-hex', 'z'.repeat(40)],
  ])('rejects %s identity in production', (_label, value) => {
    expect(() => resolveRailwayReleaseSha(
      { NODE_ENV: 'production', RAILWAY_GIT_COMMIT_SHA: value },
      { production: true }
    )).toThrow(/RAILWAY_GIT_COMMIT_SHA/u);
  });

  it('allows local and test processes to run without deployment metadata', () => {
    expect(resolveRailwayReleaseSha(
      { NODE_ENV: 'test' },
      { production: false }
    )).toBeNull();
  });
});
