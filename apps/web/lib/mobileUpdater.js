// Mobile OTA update helpers for the native (Capacitor) Android/iOS app.
//
// The native app ships a web bundle baked in at build time. Newer web bundles
// are published to the production host as `/mobile/latest.json` + a zip (see
// scripts/build-mobile-bundle.mjs). Merging to main makes Vercel rebuild from
// main and republish the feed, so "check for updates" really does mean "run
// the latest production build of the GitHub repo".
//
// SECURITY POSTURE — this is the reason the sibling app's first OTA attempt
// was removed (sermonsmith PR #96, "remove unsigned OTA update path"): a
// bundle downloaded at runtime is no longer the bytes that were signed. This
// implementation closes that hole instead of dropping the capability:
//
//   1. The publisher records the SHA-256 of the exact zip it wrote.
//   2. The manifest is REQUIRED to carry that `sha256`; a feed without one is
//      rejected before anything is downloaded.
//   3. The checksum is handed to @capgo/capacitor-updater's `download()`,
//      which hashes the downloaded file and throws on mismatch (verified in
//      the plugin source: CapgoUpdater.java "Checksum failed", and the iOS
//      equivalent in CapacitorUpdaterPlugin.swift).
//   4. We then re-compare the checksum the plugin reports back. A mismatch —
//      or a missing/short checksum — deletes the bundle and REFUSES to apply
//      it. There is no code path that calls `set()` on unverified bytes.
//
// Everything here that can be pure IS pure so it can be unit tested without a
// device: version comparison, manifest validation, native-floor comparison,
// checksum comparison, and the download/verify/apply decision.

import pkg from '../package.json';
import { loadCapacitorUpdater } from '@/lib/capacitorUpdaterPlugin.js';

/**
 * Version of the web bundle baked into the installed package. capgo reports
 * the built-in bundle as the placeholder "builtin", which carries no version,
 * so this is what we compare the feed against until an OTA bundle is active.
 */
export const BAKED_BUNDLE_VERSION = import.meta.env.VITE_APP_UPDATE_VERSION || pkg.version;

/** Production origin that hosts /mobile/latest.json + the bundle zips. */
export const UPDATE_BASE_URL = 'https://genemap-discovery.vercel.app';

/** Path of the update manifest on that origin. */
export const FEED_PATH = '/mobile/latest.json';

/**
 * DEV-ONLY override: set localStorage['genemap.mobileUpdateFeedUrl'] to a full
 * manifest URL to point the checker at a locally served latest.json (e.g.
 * through `adb reverse`).
 *
 * This is deliberately ignored in production builds. Anything that can write
 * localStorage (an XSS, a malicious deep link, a rogue extension in a
 * webview) could otherwise repoint the updater at a host it controls, which
 * turns a convenience knob into a remote-code-execution vector.
 */
export const FEED_URL_OVERRIDE_KEY = 'genemap.mobileUpdateFeedUrl';

/** localStorage key recording the last version we raised a notification for. */
export const NOTIFIED_VERSION_KEY = 'genemap.mobileUpdateNotifiedVersion';

/** A manual update check must not leave the Settings action spinning forever. */
export const UPDATE_MANIFEST_TIMEOUT_MS = 12_000;

/**
 * Parse a semver-ish version string into numeric parts.
 * Returns null when the input is not a dotted numeric version (e.g. capgo's
 * "builtin" placeholder), so callers can fall back to the baked app version.
 * @param {unknown} value
 * @returns {number[] | null}
 */
export function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+)*(-[0-9A-Za-z.-]+)?$/.test(trimmed)) return null;
  const core = trimmed.split('-')[0];
  return core.split('.').map((part) => Number.parseInt(part, 10));
}

/**
 * Compare two version strings numerically.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number} negative when a<b, 0 when equal/incomparable, positive when a>b
 */
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

/**
 * @param {unknown} candidate version offered by the update feed
 * @param {unknown} current currently-active bundle version
 * @returns {boolean} true only when candidate is strictly newer
 */
export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

/**
 * @param {unknown} value
 * @returns {boolean} true for a 64-character hex SHA-256 digest
 */
export function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim());
}

/**
 * Constant-shape checksum comparison. Anything that is not a well-formed
 * SHA-256 on BOTH sides is a mismatch — an empty or truncated checksum must
 * never read as "verified".
 * @param {unknown} expected
 * @param {unknown} actual
 * @returns {boolean}
 */
export function checksumMatches(expected, actual) {
  if (!isSha256(expected) || !isSha256(actual)) return false;
  return String(expected).trim().toLowerCase() === String(actual).trim().toLowerCase();
}

/**
 * Validate the fetched manifest shape. Returns the normalized manifest or
 * throws with an honest, user-displayable reason. The prod host serves the
 * SPA's index.html for unknown paths, so "we got HTML back" must surface as
 * "no update feed yet", never as a crash.
 * @param {unknown} raw
 * @returns {{ version: string, url: string, sha256: string, notes: string, builtAt: string, minNativeVersion: string }}
 */
export function parseUpdateManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('No signed update manifest is published for this channel.');
  }
  const record = /** @type {Record<string, unknown>} */ (raw);
  const { version, url, sha256 } = record;
  if (!parseVersion(version)) {
    throw new Error('Update feed has an invalid version field.');
  }
  if (typeof url !== 'string') {
    throw new Error('Update feed has an invalid bundle URL (must be absolute https).');
  }
  let bundleUrl;
  try {
    bundleUrl = new URL(url);
  } catch {
    throw new Error('Update feed has an invalid bundle URL (must be absolute https).');
  }
  if (bundleUrl.protocol !== 'https:' || !bundleUrl.hostname) {
    throw new Error('Update feed has an invalid bundle URL (must be absolute https).');
  }
  // Fail CLOSED: no checksum means we cannot prove the bytes we run are the
  // bytes that were built, so there is nothing safe to offer the user.
  if (!isSha256(sha256)) {
    throw new Error('Update feed is missing a valid sha256 checksum — refusing to offer an unverifiable update.');
  }
  if (record.minNativeVersion && !parseVersion(record.minNativeVersion)) {
    throw new Error('Update feed has an invalid minimum app version.');
  }
  return {
    version: String(version),
    url,
    sha256: String(sha256).trim().toLowerCase(),
    notes: typeof record.notes === 'string' ? record.notes : '',
    builtAt: typeof record.builtAt === 'string' ? record.builtAt : '',
    minNativeVersion:
      typeof record.minNativeVersion === 'string' ? record.minNativeVersion : '',
  };
}

/**
 * Resolve the manifest URL. The pinned production feed is the only value used
 * in a production build; the localStorage override is honoured in dev only.
 * @param {{ localStorage?: Pick<Storage, 'getItem'> | null, isDev?: boolean }} [opts]
 * @returns {string}
 */
export function resolveFeedUrl({ localStorage: ls, isDev = import.meta.env.DEV } = {}) {
  if (isDev) {
    try {
      const store = ls ?? (typeof localStorage !== 'undefined' ? localStorage : null);
      const override = store?.getItem(FEED_URL_OVERRIDE_KEY);
      if (override && /^https?:\/\//.test(override)) return override;
    } catch {
      // storage unavailable — fall through to the pinned feed
    }
  }
  return `${UPDATE_BASE_URL}${FEED_PATH}`;
}

/**
 * Fetch and validate the update manifest (no-cache).
 * @param {{ fetchImpl?: typeof fetch, feedUrl?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<ReturnType<typeof parseUpdateManifest>>}
 */
export async function fetchUpdateManifest({
  fetchImpl,
  feedUrl,
  timeoutMs = UPDATE_MANIFEST_TIMEOUT_MS,
} = {}) {
  const doFetch = fetchImpl ?? fetch;
  const url = feedUrl ?? resolveFeedUrl();
  const sep = url.includes('?') ? '&' : '?';
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  let timedOut = false;
  let timeoutId;
  let response;
  try {
    const timeout = new Promise((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        reject(new Error('Update check timed out. Please try again.'));
      }, timeoutMs);
    });
    response = await Promise.race([
      doFetch(`${url}${sep}ts=${Date.now()}`, { cache: 'no-store', signal: controller?.signal }),
      timeout,
    ]);
  } catch {
    if (timedOut) throw new Error('Update check timed out. Please try again.');
    throw new Error('Could not reach the update server. Check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`Update check failed (HTTP ${response.status}).`);
  }
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    throw new Error('No signed update manifest is published for this channel.');
  }
  return parseUpdateManifest(parsed);
}

/**
 * An OTA update replaces the WEB bundle only. Native code — the Capacitor
 * runtime, any plugin, permissions, the splash screen — still lives in the
 * installed package. When the published bundle needs a newer native shell we
 * must say "a new app version is required" rather than offer a web update
 * that cannot carry the change.
 *
 * Fails CLOSED: when the feed declares a floor and we cannot read the
 * device's native version, we require the store install rather than guessing.
 *
 * @param {{ minNativeVersion?: string } | null | undefined} manifest
 * @param {unknown} nativeVersion version reported by CapacitorUpdater.current().native
 * @returns {boolean}
 */
export function requiresNativeUpdate(manifest, nativeVersion) {
  const floor = manifest?.minNativeVersion;
  if (!parseVersion(floor)) return false;
  if (!parseVersion(nativeVersion)) return true;
  return compareVersions(nativeVersion, floor) < 0;
}


/**
 * Download the bundle named by the manifest, VERIFY it, and only then apply
 * it. Any verification failure deletes the downloaded bundle and throws — the
 * caller never gets a code path that applies unverified bytes.
 *
 * @param {{ version: string, url: string, sha256: string, minNativeVersion?: string }} manifest
 * @param {{ updater?: any, onProgress?: (percent: number) => void, apply?: boolean }} [opts]
 * @returns {Promise<{ id?: string, version?: string, checksum?: string }>}
 */
export async function downloadAndApplyUpdate(manifest, { updater, onProgress, apply = true } = {}) {
  if (!isSha256(manifest?.sha256)) {
    throw new Error('Update refused: the feed did not publish a bundle checksum.');
  }
  const plugin = updater ?? (await loadCapacitorUpdater()).plugin;
  if (manifest.minNativeVersion) {
    const current = await plugin.current?.();
    if (requiresNativeUpdate(manifest, current?.native)) {
      throw new Error('Install the latest signed app release before applying this update.');
    }
  }

  let listener = null;
  if (typeof onProgress === 'function' && typeof plugin.addListener === 'function') {
    try {
      listener = await plugin.addListener('download', (event) => {
        if (typeof event?.percent === 'number') onProgress(event.percent);
      });
    } catch {
      listener = null; // progress is a nicety, never a gate
    }
  }

  let bundle;
  try {
    // The plugin hashes the downloaded file against this and throws on
    // mismatch. That is the first of two independent checks.
    bundle = await plugin.download({
      url: manifest.url,
      version: manifest.version,
      checksum: manifest.sha256,
    });
  } finally {
    try {
      listener?.remove?.();
    } catch {
      /* listener already gone */
    }
  }

  // Second check, in our own code: whatever the plugin reports as the hash of
  // what it stored must equal what the feed promised.
  if (!checksumMatches(manifest.sha256, bundle?.checksum)) {
    if (bundle?.id) {
      try {
        await plugin.delete({ id: bundle.id });
      } catch {
        /* best effort — we still refuse to apply it */
      }
    }
    throw new Error(
      'Update refused: the downloaded bundle failed its integrity check. Nothing was applied.',
    );
  }

  if (apply) {
    // set() swaps to the verified bundle and reloads the webview.
    await plugin.set({ id: bundle.id });
  }
  return bundle;
}

/**
 * Read the currently-running bundle + native version.
 *
 * `bundleVersion` falls back to the version baked into this build, because
 * capgo reports the built-in bundle as "builtin" — an unparseable placeholder
 * that must never be mistaken for "no version known", or every comparison
 * would silently report "up to date".
 *
 * `nativeVersion` stays null when the plugin is unavailable (an older package
 * built before the updater shipped); callers treat that as "cannot prove the
 * native floor is met".
 *
 * @param {{ updater?: any }} [opts]
 * @returns {Promise<{ bundleVersion: string, nativeVersion: string | null }>}
 */
export async function readInstalledVersions({ updater } = {}) {
  try {
    const plugin = updater ?? (await loadCapacitorUpdater()).plugin;
    const current = await plugin.current();
    const bundleVersion = parseVersion(current?.bundle?.version)
      ? String(current.bundle.version)
      : BAKED_BUNDLE_VERSION;
    const nativeVersion = current?.native ? String(current.native) : null;
    return { bundleVersion, nativeVersion };
  } catch {
    return { bundleVersion: BAKED_BUNDLE_VERSION, nativeVersion: null };
  }
}

