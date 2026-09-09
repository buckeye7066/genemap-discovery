// Launch/resume update check + local notification for the native app.
//
// WHY LOCAL, NOT PUSH. A server push (FCM on Android, APNs on iOS) would need
// a Firebase project, an APNs signing key and a sending service, none of which
// this project has provisioned. A check on launch and on resume-from-
// background, raising a LOCAL notification, works on both platforms today
// with zero backend and no new secrets. If a push backend is ever stood up it
// can reuse `checkForUpdateAndNotify` unchanged.
//
// Rules this module enforces:
//   * at most ONE notification per published version (localStorage-recorded);
//   * a denied notification permission degrades SILENTLY and must never break
//     the in-app path — the in-app prompt is emitted before, and independently
//     of, any notification attempt;
//   * we never ask for the permission twice: if the OS already said "denied"
//     we skip straight past it instead of re-prompting on every resume.

import { loadLocalNotifications } from '@/lib/capacitorUpdaterPlugin.js';
import {
  NOTIFIED_VERSION_KEY,
  fetchUpdateManifest,
  isNewerVersion,
  readInstalledVersions,
  requiresNativeUpdate,
} from '@/lib/mobileUpdater.js';

/** Window event carrying an available update to the in-app prompt. */
export const UPDATE_AVAILABLE_EVENT = 'genemap:mobile-update-available';

/** Stable notification id so a re-notify replaces rather than stacks. */
export const UPDATE_NOTIFICATION_ID = 9001;

/** Don't hammer the feed when a user flicks between apps. */
export const MIN_CHECK_INTERVAL_MS = 60 * 1000;

let pendingUpdate = null;
export const getPendingMobileUpdate = () => pendingUpdate;

/**
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * @returns {string} the last version we notified about ('' when unknown)
 */
export function lastNotifiedVersion(storage) {
  try {
    return storage?.getItem(NOTIFIED_VERSION_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * @param {unknown} version
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * @returns {boolean} true when this version has not been notified about yet
 */
export function shouldNotifyForVersion(version, storage) {
  if (typeof version !== 'string' || !version) return false;
  return lastNotifiedVersion(storage) !== version;
}

/**
 * @param {string} version
 * @param {Pick<Storage, 'setItem'> | null | undefined} storage
 */
export function markVersionNotified(version, storage) {
  try {
    storage?.setItem(NOTIFIED_VERSION_KEY, version);
  } catch {
    // storage unavailable — worst case the user sees the notice again
  }
}

/**
 * Deliver the OS notification, honouring an existing permission decision.
 * Returns false (never throws) whenever the notification could not be shown.
 * @param {any} notifications LocalNotifications-like plugin
 * @param {{ version: string }} manifest
 * @param {boolean} needsNative
 * @returns {Promise<boolean>}
 */
export async function deliverNotification(notifications, manifest, needsNative) {
  if (!notifications) return false;
  try {
    const current = await notifications.checkPermissions?.();
    let state = current?.display;
    if (state === 'denied') return false; // respect the user's "no" — do not re-prompt
    if (state !== 'granted') {
      const requested = await notifications.requestPermissions?.();
      state = requested?.display;
    }
    if (state !== 'granted') return false;
    await notifications.schedule({
      notifications: [
        {
          id: UPDATE_NOTIFICATION_ID,
          title: needsNative ? 'GeneMap: new app version available' : 'GeneMap update available',
          body: needsNative
            ? `Version ${manifest.version} needs a new app install. Open Settings for the download link.`
            : `Version ${manifest.version} is ready. Open Settings to install it.`,
        },
      ],
    });
    return true;
  } catch {
    return false; // permission denied, plugin missing, OS refused — all silent
  }
}

/**
 * One check cycle. Fully injectable so every branch is unit testable without
 * a device.
 *
 * @param {{
 *   fetchManifest?: () => Promise<any>,
 *   currentVersion?: string | null,
 *   nativeVersion?: string | null,
 *   notifications?: any,
 *   storage?: (Pick<Storage, 'getItem'> & Pick<Storage, 'setItem'>) | null,
 *   emit?: (detail: { manifest: any, needsNative: boolean }) => void,
 * }} [opts]
 * @returns {Promise<{ status: string, manifest?: any, needsNative?: boolean }>}
 */
export async function checkForUpdateAndNotify(opts = {}) {
  const {
    fetchManifest = fetchUpdateManifest,
    currentVersion,
    nativeVersion,
    notifications = null,
    storage = null,
    emit,
  } = opts;

  let manifest;
  try {
    manifest = await fetchManifest();
  } catch {
    return { status: 'check-failed' };
  }
  if (!isNewerVersion(manifest?.version, currentVersion)) {
    return { status: 'up-to-date', manifest };
  }

  const needsNative = requiresNativeUpdate(manifest, nativeVersion);

  // In-app prompt FIRST and unconditionally: it needs no permission, so a
  // denied notification permission can never cost the user the update path.
  try {
    emit?.({ manifest, needsNative });
  } catch {
    // a broken listener must not abort the notification
  }

  if (!shouldNotifyForVersion(manifest.version, storage)) {
    return { status: 'already-notified', manifest, needsNative };
  }

  const delivered = await deliverNotification(notifications, manifest, needsNative);
  if (delivered) {
    // Only record it once it actually reached the user, so granting the
    // permission later still earns exactly one notification.
    markVersionNotified(manifest.version, storage);
    return { status: 'notified', manifest, needsNative };
  }
  return { status: 'notification-suppressed', manifest, needsNative };
}

/**
 * Wire the check to app launch and to resume-from-background.
 *
 * `visibilitychange` is the platform-neutral resume signal: Android's WebView
 * and iOS' WKWebView both fire it when the app returns to the foreground, so
 * this needs no additional native plugin.
 *
 * @param {{
 *   isNative: boolean,
 *   doc?: Document,
 *   loadNotifications?: () => Promise<any>,
 *   storage?: any,
 *   now?: () => number,
 *   runCheck?: (opts: any) => Promise<any>,
 *   minIntervalMs?: number,
 * }} opts
 * @returns {() => void} stop function
 */
export function startMobileUpdateNotifier({
  isNative,
  doc = typeof document !== 'undefined' ? document : undefined,
  loadNotifications = async () => (await loadLocalNotifications()).plugin,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  now = () => Date.now(),
  runCheck = checkForUpdateAndNotify,
  minIntervalMs = MIN_CHECK_INTERVAL_MS,
} = /** @type {any} */ ({})) {
  if (!isNative || !doc) return () => {};

  let lastCheck = 0;
  let inFlight = false;
  let stopped = false;

  const tick = async () => {
    if (stopped || inFlight) return;
    const at = now();
    if (lastCheck && at - lastCheck < minIntervalMs) return;
    inFlight = true;
    lastCheck = at;
    try {
      const { bundleVersion, nativeVersion } = await readInstalledVersions();
      let notifications = null;
      try {
        notifications = await loadNotifications();
      } catch {
        notifications = null; // plugin missing in an older package — in-app prompt still works
      }
      await runCheck({
        currentVersion: bundleVersion ?? undefined,
        nativeVersion: nativeVersion ?? undefined,
        notifications,
        storage,
        emit: (detail) => {
          pendingUpdate = detail;
          try {
            window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail }));
          } catch {
            /* no CustomEvent in this environment */
          }
        },
      });
    } catch {
      // never let a background check surface as an app error
    } finally {
      inFlight = false;
    }
  };

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') void tick();
  };

  doc.addEventListener('visibilitychange', onVisibility);
  const poll = setInterval(onVisibility, minIntervalMs);
  const host = doc.defaultView;
  host?.addEventListener('online', onVisibility);
  void tick(); // launch check

  return () => {
    stopped = true;
    clearInterval(poll);
    host?.removeEventListener('online', onVisibility);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}

