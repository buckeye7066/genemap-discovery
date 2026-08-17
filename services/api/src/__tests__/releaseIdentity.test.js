import { describe, expect, it } from 'vitest';
import { releaseIdentity, releaseSha } from '../config/releaseIdentity.js';

describe('release identity', () => {
  it('prefers the platform source revision and normalizes it for exact comparisons', () => {
    expect(releaseSha({
      RAILWAY_GIT_COMMIT_SHA: `  ${'A'.repeat(40)}  `,
      GITHUB_SHA: 'b'.repeat(40),
    })).toBe('a'.repeat(40));
  });

  it('falls back across supported deployment providers without exposing other environment data', () => {
    expect(releaseIdentity({ VERCEL_GIT_COMMIT_SHA: 'c'.repeat(40), SECRET: 'do-not-return' }))
      .toEqual({ releaseSha: 'c'.repeat(40) });
    expect(releaseIdentity({})).toEqual({ releaseSha: null });
  });
});
