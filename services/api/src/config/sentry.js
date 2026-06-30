/**
 * Optional Sentry error tracking for the API.
 *
 * Entirely gated on the SENTRY_DSN env var: with no DSN this is a no-op, so the
 * app runs identically whether or not Sentry is configured. The owner activates
 * it by setting SENTRY_DSN (and optionally SENTRY_TRACES_SAMPLE_RATE) in
 * Railway. Telemetry must never break a request, so every call is guarded.
 */
import * as Sentry from '@sentry/node';

let enabled = false;

export function initSentry(env) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  try {
    Sentry.init({
      dsn,
      environment: env?.NODE_ENV || process.env.NODE_ENV || 'production',
      release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
      // Tracing is opt-in (off by default) to avoid surprise quota usage.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
      // We control exactly what we send (no request bodies / PII).
      sendDefaultPii: false,
    });
    enabled = true;
  } catch {
    enabled = false;
  }
  return enabled;
}

export function isSentryEnabled() {
  return enabled;
}

/**
 * Report a server-side exception with minimal, non-PII context. Safe to call
 * unconditionally — does nothing when Sentry isn't configured.
 */
export function captureException(error, context) {
  if (!enabled) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* swallow — telemetry must never affect the response path */
  }
}
