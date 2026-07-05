-- First-login owner notification support. last_login_at is stamped on every
-- successful sign-in; the NULL->set transition is the one-time "new user just
-- logged in for the first time" signal that emails the owner.
-- Existing users are backfilled to created_at so nobody who signed up before
-- this feature reads as "new" on their next login.
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);
UPDATE "users" SET "last_login_at" = "created_at";
