import { describe, expect, it } from 'vitest';
import {
  normalizeReleaseSha,
  releaseIdentityJson,
  resolveReleaseSha,
} from '../releaseIdentity.js';

describe('web release identity', () => {
  it('prefers the exact Vercel commit and normalizes it', () => {
    const vercelSha = 'A'.repeat(40);
    expect(resolveReleaseSha({
      VERCEL_GIT_COMMIT_SHA: `  ${vercelSha}  `,
      GITHUB_SHA: 'b'.repeat(40),
    })).toBe('a'.repeat(40));
  });

  it('falls back to CI or an explicit release SHA but never accepts abbreviations', () => {
    expect(resolveReleaseSha({ GITHUB_SHA: 'b'.repeat(40) })).toBe('b'.repeat(40));
    expect(resolveReleaseSha({ RELEASE_SHA: 'c'.repeat(64) })).toBe('c'.repeat(64));
    expect(normalizeReleaseSha('deadbeef')).toBeNull();
    expect(JSON.parse(releaseIdentityJson({}))).toEqual({ releaseSha: null });
  });
});
