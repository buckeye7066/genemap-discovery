/**
 * Role helpers for UI gating.
 *
 * These decide what a user *sees*; they are NOT an authorization boundary. The
 * backend (`requireRole` / `requireSuperAdmin` in services/api) is the real
 * gate — hiding a nav link never grants or revokes access on its own.
 */

export function isAdminUser(user) {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.role === 'super_admin' ||
    user.entitlements?.isAdmin === true
  );
}

export function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}
