const SHA_PATTERN = /^[a-f0-9]{40}$/u;

/**
 * Railway exposes RAILWAY_GIT_COMMIT_SHA for GitHub-triggered deployments.
 * Production must not start without that provider-issued identity, otherwise
 * readiness and launch verification cannot prove which code is responding.
 */
export function resolveRailwayReleaseSha(
  source = process.env,
  { production = source.NODE_ENV === 'production' } = {}
) {
  const value = source.RAILWAY_GIT_COMMIT_SHA || '';
  if (SHA_PATTERN.test(value)) return value;
  if (production) {
    throw new Error(
      '[env] production API requires a valid RAILWAY_GIT_COMMIT_SHA from a GitHub-triggered Railway deployment'
    );
  }
  return null;
}

export const RELEASE_SHA_PATTERN = SHA_PATTERN;
