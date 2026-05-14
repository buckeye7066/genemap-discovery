// Normalise heterogeneous error objects (fetch errors, axios-style errors,
// plain Errors, string throws) into a user-safe message. We deliberately
// strip stack traces and any nested `response.data` payloads so we never
// leak server internals to the UI.
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string' && err.message.length > 0) {
    if (err.message === 'Failed to fetch') return 'Could not reach the server. Check your connection and retry.';
    return err.message;
  }
  if (err.error && typeof err.error === 'string') return err.error;
  return fallback;
}

export function isUnauthorized(err) {
  if (!err) return false;
  if (err.status === 401 || err.statusCode === 401) return true;
  return typeof err.message === 'string' && /unauthor/i.test(err.message);
}
