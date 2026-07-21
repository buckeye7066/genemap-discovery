// Login maintenance mode.
//
// While `active` is true the Login page replaces the sign-in/register form
// with an upgrade banner. The API twin (services/api/src/routes/auth.js)
// rejects /login and /register with 503 so the block holds server-side too.
// Flip both to false (one commit) when the upgrade is finished.
export const LOGIN_MAINTENANCE = {
  active: true,
  title: "GeneMap Discovery is being upgraded",
  message:
    "We are performing a scheduled upgrade. Sign-in and registration are temporarily disabled while we finish.",
  etaText: "Expected back online by 8:00 PM Eastern tonight (Monday, July 21).",
};
