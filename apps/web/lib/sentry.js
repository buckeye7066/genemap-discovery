import * as Sentry from '@sentry/react';

/**
 * Optional browser error tracking. Gated on VITE_SENTRY_DSN (baked at build
 * time by Vercel): with no DSN this is a no-op, so the app behaves identically
 * whether or not Sentry is configured. The owner activates it by setting
 * VITE_SENTRY_DSN in the Vercel project. Errors are also still reported to the
 * backend owner-email pipeline (see main.jsx) — Sentry is additive.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return false;
  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
      // Don't capture potentially-sensitive request bodies / inputs.
      sendDefaultPii: false,
    });
    return true;
  } catch {
    return false;
  }
}

/** Manually report a handled error (no-op when Sentry is unconfigured). */
export function captureException(error) {
  try {
    Sentry.captureException(error);
  } catch {
    /* swallow */
  }
}
