const SHA_PATTERN = /^[a-f0-9]{40}$/u;

export function resolveVercelReleaseSha(source = process.env) {
  const value = source.VERCEL_GIT_COMMIT_SHA || '';
  if (SHA_PATTERN.test(value)) return value;

  const identityRequired =
    source.GENEMAP_REQUIRE_RELEASE_IDENTITY === '1' ||
    source.VERCEL === '1' ||
    Boolean(source.VERCEL_ENV) ||
    Boolean(source.VERCEL_TARGET_ENV);
  if (identityRequired) {
    throw new Error(
      'Vercel build requires a valid VERCEL_GIT_COMMIT_SHA from the linked Git deployment'
    );
  }

  // Local and generic CI builds are useful for tests and artifact scanning, but
  // their output is intentionally incapable of passing the live launch gate.
  return 'unavailable';
}
