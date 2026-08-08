// Login maintenance mode — FALLBACK copy + default.
//
// The Login page asks GET /auth/maintenance at runtime and follows the
// server's answer (toggled by the LOGIN_MAINTENANCE env var on the API —
// '1' on, '0' off, default OFF — no rebuild needed). This static object is
// only the initial render state before the probe answers and the fallback
// when the API is unreachable; `active: false` matches the API's default so
// a normal page load never flashes the upgrade banner. The server twin lives
// in services/api/src/routes/auth.js.
export const LOGIN_MAINTENANCE = {
  active: false,
  title: "GeneMap Discovery is being upgraded",
  message:
    "We are performing a scheduled upgrade. Sign-in and registration are temporarily disabled while we finish.",
  // Date-free by design: this is only the pre-probe/offline fallback, and a
  // hardcoded date here goes stale silently (it read "Monday, July 21" months
  // late). The live ETA comes from the server probe, which the owner sets with
  // the API's LOGIN_MAINTENANCE_ETA env var.
  etaText: "We expect to be back online shortly.",
};
