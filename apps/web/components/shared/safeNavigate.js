// Browser-environment helpers. The original module was missing from the
// repo; we reimplement just the surface area Layout.jsx imports
// (`getBrowserEnvironment`) plus a couple of safe nav helpers used elsewhere.
export function getBrowserEnvironment() {
  if (typeof window === 'undefined') {
    return { isBrowser: false, isServer: true, isEmbedded: false, hostname: '', search: '' };
  }
  const inIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  return {
    isBrowser: true,
    isServer: false,
    isEmbedded: inIframe,
    hostname: window.location?.hostname ?? '',
    search: window.location?.search ?? '',
  };
}

export function safeNavigate(path) {
  if (typeof window === 'undefined') return;
  if (!path || typeof path !== 'string') return;
  try {
    window.location.assign(path);
  } catch {
    /* noop */
  }
}
