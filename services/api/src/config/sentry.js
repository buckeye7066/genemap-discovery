/**
 * External exception export is disabled in the education/research publication
 * build. Keep this compatibility surface as a no-op so boot and middleware do
 * not depend on a configured telemetry processor.
 */
export function initSentry() {
  return false;
}

export function isSentryEnabled() {
  return false;
}

export function captureException() {
  // Intentionally disabled: Error objects and stacks can contain user text.
}
