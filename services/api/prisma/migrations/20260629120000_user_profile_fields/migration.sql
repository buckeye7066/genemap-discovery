-- Profile fields the React UI always collected but the migrated Postgres User
-- model never had (Base44 carryover). Without these columns PUT /auth/me
-- silently dropped mailing-list opt-in, age, field of study, research
-- interests, current projects, publications, LinkedIn, ORCID, and avatar, and
-- GET /auth/me never returned them — so the Profile page neither saved nor
-- reloaded any of it.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) to match the deploy-only migration
-- convention; the dev `db push` path derives the same columns from schema.prisma.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mailing_list_opt_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "field_of_study" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "research_interests" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "current_projects" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "publications" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedin_url" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "orcid_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_picture" TEXT;
