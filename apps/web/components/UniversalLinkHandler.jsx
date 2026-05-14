/**
 * UniversalLinkHandler — feature-flagged stub.
 *
 * The Layout previously imported a UniversalLinkHandler that intercepted
 * in-app navigation. The file was missing from the repo and broke the build.
 *
 * The current implementation is intentionally a no-op: React Router
 * `<Link>` and `<Routes>` already handle navigation in App.jsx, so removing
 * the original handler does not regress UX.
 *
 * Set `VITE_ENABLE_UNIVERSAL_LINK_HANDLER=1` once a real implementation
 * lands. Otherwise the stub stays inert and surfaces a single dev-mode
 * warning so the gap is auditable.
 */
let _warned = false;

export default function UniversalLinkHandler() {
  if (!_warned && import.meta.env.DEV && !import.meta.env.VITE_ENABLE_UNIVERSAL_LINK_HANDLER) {
    _warned = true;
     
    console.warn(
      '[UniversalLinkHandler] feature-flagged stub is active. ' +
        'Set VITE_ENABLE_UNIVERSAL_LINK_HANDLER=1 once a real component lands.',
    );
  }
  return null;
}

export const isStub = true;
