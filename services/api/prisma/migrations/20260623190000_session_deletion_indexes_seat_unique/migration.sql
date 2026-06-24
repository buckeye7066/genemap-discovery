-- Performance + integrity hardening (audit 2026-06-23).
--
-- These statements are idempotent-friendly: applied once via
-- `prisma migrate deploy` in prod. The dev workflow uses `prisma db push`,
-- which derives indexes from schema.prisma directly (and therefore creates the
-- two named indexes below, but NOT the partial unique index, which the Prisma
-- schema language cannot express — see the note on it).

-- Support session-expiry sweeps: DELETE FROM sessions WHERE expires_at < now().
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions"("expires_at");

-- Support batch processing of pending data-deletion requests
-- (WHERE status = 'pending' ORDER BY requested_at).
CREATE INDEX IF NOT EXISTS "data_deletion_requests_status_requested_at_idx"
  ON "data_deletion_requests"("status", "requested_at");

-- Enforce ONE active seat per (license, user) at the database level. Prisma's
-- schema language has no partial-unique construct, so this index exists only in
-- migrations; the same invariant is enforced in application code
-- (routes/entities.js POST /licenses/:id/assign) so the dev `db push` path,
-- which will not create this index, stays correct too.
CREATE UNIQUE INDEX IF NOT EXISTS "license_assignments_active_user_unique"
  ON "license_assignments"("license_id", "user_email")
  WHERE "status" = 'active';
