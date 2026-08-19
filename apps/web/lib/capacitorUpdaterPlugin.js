// The single place that reaches for the native updater plugin.
//
// Kept as its own module for two reasons:
//
//  1. It is the seam. Everything else in the OTA path takes the plugin as an
//     argument, so the download/verify/refuse logic can be exercised without a
//     device; this module is what the app itself calls.
//  2. The plugin handle is returned WRAPPED. Capacitor's handle is a Proxy
//     that answers every property with a bridge call — including `then`, so it
//     looks like a thenable. Returning it bare from an async function makes
//     the runtime await it and invoke `CapacitorUpdater.then()`, which fails
//     with UNIMPLEMENTED. A plain wrapper object has no `then` and survives.

/**
 * @returns {Promise<{ plugin: any }>}
 */
export async function loadCapacitorUpdater() {
  const mod = await import('@capgo/capacitor-updater');
  return { plugin: mod.CapacitorUpdater };
}

/**
 * @returns {Promise<{ plugin: any }>}
 */
export async function loadLocalNotifications() {
  const mod = await import('@capacitor/local-notifications');
  return { plugin: mod.LocalNotifications };
}
