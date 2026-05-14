/**
 * MobileOptimization — feature-flagged stub.
 *
 * See PlatformCompatibility.jsx for rationale and re-enable instructions.
 * Gated on `VITE_ENABLE_MOBILE_OPTIMIZATION`.
 */
let _warned = false;

export default function MobileOptimization() {
  if (!_warned && import.meta.env.DEV && !import.meta.env.VITE_ENABLE_MOBILE_OPTIMIZATION) {
    _warned = true;
     
    console.warn(
      '[MobileOptimization] feature-flagged stub is active. ' +
        'Set VITE_ENABLE_MOBILE_OPTIMIZATION=1 once a real component lands.',
    );
  }
  return null;
}

export const isStub = true;
