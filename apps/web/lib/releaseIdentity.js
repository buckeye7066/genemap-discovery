const FULL_COMMIT_SHA = /^[0-9a-f]{40,64}$/u;

export function normalizeReleaseSha(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return FULL_COMMIT_SHA.test(normalized) ? normalized : null;
}

export function resolveReleaseSha(source = {}) {
  for (const key of ['VERCEL_GIT_COMMIT_SHA', 'GITHUB_SHA', 'RELEASE_SHA']) {
    const value = normalizeReleaseSha(source[key]);
    if (value) return value;
  }
  return null;
}

export function releaseIdentityJson(source = {}) {
  return `${JSON.stringify({ releaseSha: resolveReleaseSha(source) })}\n`;
}
