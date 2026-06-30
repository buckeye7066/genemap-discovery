import { apiClient } from '@genemap/shared';

// Same-message dedupe so a tight render loop or a repeatedly-rejected promise
// can't flood the backend (which has its own throttle, but we avoid the chatter
// at the source too).
const DEDUPE_MS = 60_000;
let lastReport = { message: null, at: 0 };

/**
 * Report a client-side error to the backend, which decides whether to email the
 * owner. Fire-and-forget: never throws, swallows all failures.
 *
 * @param {any} error               an Error (or anything thrown)
 * @param {object} [info]
 * @param {string} [info.componentStack]  React error-boundary component stack
 * @param {number} [info.statusCode]
 */
export function reportClientError(error, info = {}) {
  try {
    const err = /** @type {any} */ (error);
    const message =
      err && err.message ? String(err.message) : String(err || 'Unknown client error');

    const now = Date.now();
    if (lastReport.message === message && now - lastReport.at < DEDUPE_MS) return;
    lastReport = { message, at: now };

    const payload = {
      message,
      name: (err && err.name) || 'Error',
      stack: (err && err.stack) || '',
      componentStack: info.componentStack || '',
      route: typeof window !== 'undefined' ? window.location.pathname : '',
      statusCode: info.statusCode,
    };

    // Reuse the shared ApiClient so the report inherits the resolved API base
    // URL + CSRF handling. Detached + swallowed: reporting must never surface
    // its own error to the caller.
    Promise.resolve(
      apiClient.request('/report-client-error', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    ).catch(() => {});
  } catch {
    /* swallow — error reporting must never itself throw */
  }
}

export default reportClientError;
