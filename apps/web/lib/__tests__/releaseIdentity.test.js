import { describe, expect, it } from 'vitest';
import { resolveVercelReleaseSha } from '../releaseIdentity.js';

describe('Vercel release identity', () => {
  it('accepts the provider-issued immutable Git SHA', () => {
    const sha = 'a'.repeat(40);
    expect(resolveVercelReleaseSha({
      VERCEL: '1',
      VERCEL_GIT_COMMIT_SHA: sha,
    })).toBe(sha);
  });

  it.each([
    ['missing', undefined],
    ['short', 'abc123'],
    ['non-hex', 'z'.repeat(40)],
  ])('rejects %s identity in a Vercel build', (_label, value) => {
    expect(() => resolveVercelReleaseSha({
      VERCEL: '1',
      VERCEL_GIT_COMMIT_SHA: value,
    })).toThrow(/VERCEL_GIT_COMMIT_SHA/u);
  });

  it('marks local builds as unverifiable without blocking them', () => {
    expect(resolveVercelReleaseSha({})).toBe('unavailable');
  });
});
