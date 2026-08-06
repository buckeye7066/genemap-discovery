import { apiClient } from '@genemap/shared';

const DEDUPE_MS = 60_000;
const ALLOWED_ERROR_CLASSES = new Set([
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
]);
let lastReport = { key: null, at: 0 };

/**
 * Send only a finite, non-identifying operational event. Error messages,
 * stacks, routes, user values, and caller-supplied status codes can contain
 * sensitive free text and must never leave the browser through this path.
 *
 * @param {unknown} error
 * @param {{ componentStack?: string }} [info]
 */
export function reportClientError(error, info = {}) {
  try {
    const candidate = /** @type {{ name?: unknown }} */ (error);
    const candidateName = typeof candidate?.name === 'string' ? candidate.name : 'Error';
    const errorClass = ALLOWED_ERROR_CLASSES.has(candidateName) ? candidateName : 'Error';
    const eventCode = info.componentStack ? 'react_render_error' : 'client_runtime_error';
    const key = `${eventCode}:${errorClass}`;

    const now = Date.now();
    if (lastReport.key === key && now - lastReport.at < DEDUPE_MS) return;
    lastReport = { key, at: now };

    Promise.resolve(
      apiClient.request('/report-client-error', {
        method: 'POST',
        body: JSON.stringify({ eventCode, errorClass }),
      }),
    ).catch(() => {});
  } catch {
    /* reporting must never affect the user-visible error path */
  }
}

export default reportClientError;
