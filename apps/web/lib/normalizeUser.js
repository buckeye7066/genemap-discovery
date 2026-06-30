/**
 * Normalize an admin user object to the snake_case contract the UI renders.
 *
 * The app speaks snake_case everywhere (matching /auth/me), but the /admin/*
 * API historically emitted camelCase. This accepts EITHER shape so the admin
 * pages render correctly regardless of which API version is currently live —
 * important here because the web app (Vercel) auto-deploys while the API
 * (Railway) is deployed manually, so the two can be briefly out of step.
 *
 * The original object is spread through first so any field we don't explicitly
 * map still survives for callers that read it directly.
 */
export function normalizeAdminUser(u = {}) {
  return {
    ...u,
    id: u.id,
    email: u.email ?? null,
    role: u.role ?? 'user',
    banned: u.banned ?? false,
    full_name: u.full_name ?? u.fullName ?? null,
    display_name: u.display_name ?? u.displayName ?? null,
    phone_number: u.phone_number ?? u.phoneNumber ?? null,
    ban_reason: u.ban_reason ?? u.banReason ?? null,
    banned_date: u.banned_date ?? u.bannedDate ?? null,
    banned_by: u.banned_by ?? u.bannedBy ?? null,
    created_date: u.created_date ?? u.createdAt ?? u.created_at ?? null,
    last_active: u.last_active ?? u.lastActiveAt ?? null,
    pre_banned: u.pre_banned ?? false,
  };
}

/**
 * Normalize a pre-banned record (its own table, different field names) into the
 * same snake_case user shape, flagged pre_banned. Accepts both the new combined
 * shape (already snake_case + pre_banned) and the legacy raw preBannedUser row.
 */
export function normalizePreBannedUser(p = {}) {
  return {
    ...p,
    id: p.id,
    email: p.email && p.email !== '' ? p.email : null,
    role: p.role ?? 'user',
    banned: true,
    full_name: p.full_name ?? p.fullName ?? null,
    phone_number: p.phone_number ?? p.phoneNumber ?? null,
    ban_reason: p.ban_reason ?? p.reason ?? null,
    banned_date: p.banned_date ?? p.bannedDate ?? p.createdAt ?? null,
    banned_by: p.banned_by ?? p.bannedBy ?? null,
    pre_banned: true,
  };
}
