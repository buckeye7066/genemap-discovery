const RELEASE_SHA_KEYS = Object.freeze([
  'RAILWAY_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_SHA',
  'GITHUB_SHA',
  'RELEASE_SHA',
]);

/** Return the non-secret source revision associated with this running release. */
export function releaseSha(source = process.env) {
  for (const key of RELEASE_SHA_KEYS) {
    const candidate = source?.[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return null;
}

export function releaseIdentity(source = process.env) {
  return { releaseSha: releaseSha(source) };
}
