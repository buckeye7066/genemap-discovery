/**
 * Native-app detection (Capacitor Android/iOS builds).
 *
 * Google Play's payments policy requires Play Billing for in-app purchases of
 * digital goods, and Apple applies the equivalent IAP rule. GeneMap sells
 * subscriptions on the web via Stripe, which is only store-compliant if the
 * installed app never offers a purchase flow or steers users toward an
 * external one (the "reader app" model). Every purchase surface (Premium
 * page, Institutional pricing, upgrade banners/CTAs) checks this flag and
 * renders a neutral notice — or nothing — in native builds instead.
 *
 * The same web bundle ships to Vercel, Electron and Capacitor; only the
 * Capacitor runtime injects window.Capacitor, so this is a runtime check.
 */
export function isNativeApp() {
  // `Capacitor` is injected on window only by the native runtime and isn't part
  // of the DOM lib types, so cast to any to read it under strict checkJs.
  const cap = typeof window !== 'undefined' ? /** @type {any} */ (window).Capacitor : undefined;
  if (!cap) return false;
  return typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : !!cap.isNative;
}
