// Mobile OTA update helpers for the native (Capacitor) Android/iOS app.
//
// The native app ships a web bundle baked in at build time. Newer web bundles
// are published to the production host as `/mobile/latest.json` + a zip (see
// scripts/build-mobile-bundle.mjs at the repo root; it runs as the apps/web
// postbuild step, so every Vercel deploy refreshes the feed). The Settings page
// exposes a manual "Check for Updates" control (autoUpdate is disabled in
// apps/web/capacitor.config.ts) that downloads and applies the bundle via
// @capgo/capacitor-updater.
//
// Pure/testable pieces: version parsing + comparison, manifest validation.

/** Production origin that hosts /mobile/latest.json + bundle zips. */
export const UPDATE_BASE_URL = 'https://genemap-discovery.vercel.app';

/**
 * Dev/test override: set localStorage['genemap_mobile_update_feed_url']
 * to a full manifest URL (e.g. a locally served latest.json through
 * `adb reverse`). Never used unless explicitly set.
 */
export const FEED_URL_OVERRIDE_KEY = 'genemap_mobile_update_feed_url';

/**
 * Parse a semver-ish version string into numeric parts. Returns null when the
 * input is not a dotted numeric version (e.g. capgo's "builtin" placeholder),
 * so callers can fall back to the baked app version.
 */
export function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+)*(-[0-9A-Za-z.-]+)?$/.test(trimmed)) return null;
  return trimmed.split('-')[0].split('.').map((part) => Number.parseInt(part, 10));
}

/** Numeric version compare: negative a<b, 0 equal/incomparable, positive a>b. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True only when candidate is strictly newer than current. */
export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

/**
 * Validate the fetched manifest shape. Throws with an honest, displayable
 * reason on anything malformed (404 body, SPA-fallback HTML, missing fields).
 */
export function parseUpdateManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Update feed is not available yet (no manifest published).');
  }
  const { version, url } = raw;
  if (!parseVersion(version)) {
    throw new Error('Update feed has an invalid version field.');
  }
  if (typeof url !== 'string' || !/^(https:\/\/|http:\/\/localhost(:\d+)?\/)/.test(url)) {
    throw new Error('Update feed has an invalid bundle URL (must be absolute https; http is allowed for localhost testing only).');
  }
  return {
    version: String(version),
    url,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    builtAt: typeof raw.builtAt === 'string' ? raw.builtAt : '',
  };
}

/**
 * Resolve the manifest URL (prod feed unless a dev override is set).
 * @param {{ localStorage?: { getItem(key: string): string | null } }} [opts]
 */
export function resolveFeedUrl({ localStorage: ls } = {}) {
  try {
    const store = ls ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const override = store?.getItem(FEED_URL_OVERRIDE_KEY);
    if (override && /^https?:\/\//.test(override)) return override;
  } catch {
    // storage unavailable — fall through to the prod feed
  }
  return `${UPDATE_BASE_URL}/mobile/latest.json`;
}

/**
 * Fetch and validate the update manifest (no-cache).
 * @param {{ fetchImpl?: (url: string, init?: object) => Promise<{ ok: boolean, status: number, json?: () => Promise<any> }>, feedUrl?: string }} [opts]
 */
export async function fetchUpdateManifest({ fetchImpl, feedUrl } = {}) {
  const doFetch = fetchImpl ?? fetch;
  const url = feedUrl ?? resolveFeedUrl();
  const sep = url.includes('?') ? '&' : '?';
  let response;
  try {
    response = await doFetch(`${url}${sep}ts=${Date.now()}`, { cache: 'no-store' });
  } catch {
    throw new Error('Could not reach the update server. Check your connection and try again.');
  }
  if (!response.ok) {
    throw new Error(`Update check failed (HTTP ${response.status}).`);
  }
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    throw new Error('Update feed is not available yet (no manifest published).');
  }
  return parseUpdateManifest(parsed);
}
