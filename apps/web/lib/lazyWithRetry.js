import { lazy } from 'react';

/**
 * Drop-in replacement for React.lazy that survives a stale deployment.
 *
 * Vite emits content-hashed chunks (e.g. ProteinDomains-hy1mZXij.js). When a
 * new build deploys, those hashes change and the old files are purged from the
 * CDN. A browser still holding the PREVIOUS index.html will request the old
 * hash and get a 404 — surfacing as "Failed to fetch dynamically imported
 * module" and crashing the feature (this is exactly what broke the whole
 * Visualization Hub after a redeploy).
 *
 * The fix: on a dynamic-import failure, reload ONCE to pull the fresh index +
 * chunk map, then retry. A sessionStorage guard keyed per-chunk prevents an
 * infinite reload loop if the import is genuinely broken (not just stale).
 */
export function lazyWithRetry(factory, key) {
  return lazy(async () => {
    const storageKey = `genemap:chunk-reload:${key || ''}`;
    try {
      const mod = await factory();
      try { window.sessionStorage?.removeItem(storageKey); } catch { /* private mode */ }
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = window.sessionStorage?.getItem(storageKey) === '1';
        window.sessionStorage?.setItem(storageKey, '1');
      } catch { /* sessionStorage unavailable */ }

      if (!alreadyReloaded && typeof window !== 'undefined') {
        // Reload to fetch the current index.html (and therefore valid chunk
        // URLs). Return a never-resolving promise so React shows the Suspense
        // fallback rather than flashing an error before the reload takes hold.
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    }
  });
}
