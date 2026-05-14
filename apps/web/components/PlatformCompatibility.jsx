/**
 * PlatformCompatibility — feature-flagged stub.
 *
 * The original component was missing from the repo. Rather than render
 * something misleading, this stub renders nothing AND surfaces a one-time
 * warning in development so the gap is not invisible.
 *
 * To re-enable a real implementation:
 *   1. Drop a real component into this file (signature: `() => JSX | null`).
 *   2. Set `VITE_ENABLE_PLATFORM_COMPATIBILITY=1` in the relevant
 *      `.env.production` / Vercel env. Without that flag the stub is shipped
 *      and renders nothing.
 *
 * Tracked in docs/PRODUCTION_READINESS_REPORT.md → "remaining caveats".
 */
let _warned = false;

export default function PlatformCompatibility() {
  if (!_warned && import.meta.env.DEV && !import.meta.env.VITE_ENABLE_PLATFORM_COMPATIBILITY) {
    _warned = true;
     
    console.warn(
      '[PlatformCompatibility] feature-flagged stub is active. ' +
        'Set VITE_ENABLE_PLATFORM_COMPATIBILITY=1 once a real component lands.',
    );
  }
  return null;
}

export const isStub = true;
