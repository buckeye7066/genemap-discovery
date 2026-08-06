BEGIN;

-- Independent pseudonymous key. Older API containers can omit it because the
-- database supplies the value while a rolling deployment drains.
ALTER TABLE "users" ADD COLUMN "privacy_subject_ref" UUID;

UPDATE "users"
SET "privacy_subject_ref" = gen_random_uuid()
WHERE "privacy_subject_ref" IS NULL;

DO $privacy_user_backfill$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "privacy_subject_ref" IS NULL) THEN
    RAISE EXCEPTION 'privacy subject backfill incomplete';
  END IF;
END
$privacy_user_backfill$;

ALTER TABLE "users"
  ALTER COLUMN "privacy_subject_ref" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "privacy_subject_ref" SET NOT NULL;

CREATE UNIQUE INDEX "users_privacy_subject_ref_key"
  ON "users"("privacy_subject_ref");


ALTER TABLE "consent_records" ADD COLUMN "subject_ref" UUID;
ALTER TABLE "data_deletion_requests" ADD COLUMN "subject_ref" UUID;

UPDATE "consent_records" AS consent
SET "subject_ref" = app_user."privacy_subject_ref"
FROM "users" AS app_user
WHERE consent."user_id" = app_user."id";

UPDATE "data_deletion_requests" AS deletion
SET "subject_ref" = app_user."privacy_subject_ref"
FROM "users" AS app_user
WHERE deletion."user_id" = app_user."id";

DO $privacy_evidence_backfill$
BEGIN
  IF EXISTS (SELECT 1 FROM "consent_records" WHERE "subject_ref" IS NULL)
     OR EXISTS (SELECT 1 FROM "data_deletion_requests" WHERE "subject_ref" IS NULL) THEN
    RAISE EXCEPTION 'privacy evidence subject backfill incomplete';
  END IF;
END
$privacy_evidence_backfill$;

ALTER TABLE "consent_records"
  ALTER COLUMN "subject_ref" SET NOT NULL;

ALTER TABLE "data_deletion_requests"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'legacy_content_v1',
  ADD COLUMN "requested_types" TEXT[] NOT NULL
    DEFAULT ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[],
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_attempt_at" TIMESTAMP(3),
  ADD COLUMN "next_attempt_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lease_expires_at" TIMESTAMP(3),
  ADD COLUMN "failure_code" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3);

-- Historical free-form categories are not retained as proof of deletion.
-- Only a completed row with an actual completion timestamp is accepted as a
-- completed legacy operation.
UPDATE "data_deletion_requests"
SET
  "status" = CASE
    WHEN "status" = 'completed' AND "completed_at" IS NOT NULL THEN 'completed'
    WHEN "status" = 'pending' THEN 'pending'
    WHEN "status" = 'failed' THEN 'retry_scheduled'
    ELSE 'operator_review'
  END,
  "completed_at" = CASE
    WHEN "status" = 'completed' AND "completed_at" IS NOT NULL THEN "completed_at"
    ELSE NULL
  END,
  "requested_types" = ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[],
  "deleted_types" = CASE
    WHEN "status" = 'completed' AND "completed_at" IS NOT NULL
      THEN ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END,
  "attempt_count" = CASE
    WHEN "status" = 'completed' AND "completed_at" IS NOT NULL THEN 1
    WHEN "status" = 'failed' THEN 1
    ELSE 0
  END,
  "last_attempt_at" = CASE
    WHEN "status" = 'completed' AND "completed_at" IS NOT NULL THEN "completed_at"
    WHEN "status" = 'failed' THEN "requested_at"
    ELSE NULL
  END,
  "next_attempt_at" = CASE
    WHEN "status" IN ('pending', 'failed') THEN CURRENT_TIMESTAMP
    ELSE NULL
  END,
  "lease_expires_at" = NULL,
  "failure_code" = CASE
    WHEN "status" = 'failed' THEN 'local_purge_failed'
    WHEN "status" = 'completed' AND "completed_at" IS NULL
      THEN 'legacy_state_requires_review'
    WHEN "status" NOT IN ('pending', 'completed', 'failed')
      THEN 'legacy_state_requires_review'
    ELSE NULL
  END,
  "updated_at" = COALESCE("completed_at", "requested_at", CURRENT_TIMESTAMP);

ALTER TABLE "data_deletion_requests"
  ALTER COLUMN "subject_ref" SET NOT NULL,
  ALTER COLUMN "updated_at" SET NOT NULL,
  ALTER COLUMN "deleted_types" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "deleted_types" SET NOT NULL,
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "consent_records"
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "consent_records"
  DROP CONSTRAINT "consent_records_user_id_fkey";

ALTER TABLE "data_deletion_requests"
  DROP CONSTRAINT "data_deletion_requests_user_id_fkey";

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;


DROP INDEX "consent_records_user_id_consent_type_idx";
DROP INDEX "data_deletion_requests_status_requested_at_idx";

CREATE INDEX "consent_records_latest_event_idx"
  ON "consent_records"("user_id", "consent_type", "version", "created_at");

CREATE INDEX "consent_records_subject_ref_created_at_idx"
  ON "consent_records"("subject_ref", "created_at");

CREATE INDEX "deletion_requests_subject_requested_idx"
  ON "data_deletion_requests"("subject_ref", "requested_at");

CREATE INDEX "deletion_requests_due_idx"
  ON "data_deletion_requests"("status", "next_attempt_at", "requested_at");

CREATE INDEX "deletion_requests_lease_idx"
  ON "data_deletion_requests"("status", "lease_expires_at");


ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_scope_check"
    CHECK ("scope" = 'legacy_content_v1'),
  ADD CONSTRAINT "data_deletion_requests_status_check"
    CHECK ("status" IN (
      'pending', 'processing', 'retry_scheduled', 'failed', 'completed', 'operator_review'
    )),
  ADD CONSTRAINT "data_deletion_requests_attempt_count_check"
    CHECK ("attempt_count" >= 0),
  ADD CONSTRAINT "data_deletion_requests_failure_code_check"
    CHECK (
      "failure_code" IS NULL
      OR "failure_code" IN (
        'local_purge_failed',
        'retry_exhausted',
        'legacy_state_requires_review'
      )
    );


-- Fill and validate subject_ref for writes from both current and rolling older
-- Prisma clients. The trigger also preserves it when the FK sets user_id null.
CREATE FUNCTION privacy_evidence_subject_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $privacy_evidence_subject_ref$
DECLARE
  expected_ref UUID;
BEGIN
  IF NEW."user_id" IS NULL THEN
    IF NEW."subject_ref" IS NULL THEN
      RAISE EXCEPTION 'subject_ref required' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "privacy_subject_ref"
  INTO expected_ref
  FROM "users"
  WHERE "id" = NEW."user_id";

  IF expected_ref IS NULL THEN
    RAISE EXCEPTION 'evidence user missing' USING ERRCODE = '23503';
  END IF;

  IF NEW."subject_ref" IS NULL THEN
    NEW."subject_ref" := expected_ref;
  ELSIF NEW."subject_ref" <> expected_ref THEN
    RAISE EXCEPTION 'subject_ref mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$privacy_evidence_subject_ref$;

CREATE TRIGGER consent_records_subject_ref_trigger
  BEFORE INSERT OR UPDATE OF "user_id", "subject_ref"
  ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION privacy_evidence_subject_ref();

CREATE TRIGGER data_deletion_requests_subject_ref_trigger
  BEFORE INSERT OR UPDATE OF "user_id", "subject_ref"
  ON "data_deletion_requests"
  FOR EACH ROW EXECUTE FUNCTION privacy_evidence_subject_ref();


-- Normalize lifecycle transitions made by a rolling older API container.
CREATE FUNCTION normalize_deletion_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $normalize_deletion_lifecycle$
BEGIN
  NEW."requested_types" := ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[];

  IF NEW."status" IN ('pending', 'processing', 'retry_scheduled') THEN
    NEW."completed_at" := NULL;
    NEW."deleted_types" := ARRAY[]::TEXT[];
  END IF;

  IF NEW."status" = 'completed' THEN
    NEW."completed_at" := COALESCE(NEW."completed_at", CURRENT_TIMESTAMP);
    NEW."deleted_types" := ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[];
    NEW."attempt_count" := GREATEST(COALESCE(NEW."attempt_count", 0), 1);
    NEW."last_attempt_at" := COALESCE(NEW."last_attempt_at", NEW."completed_at");
    NEW."next_attempt_at" := NULL;
    NEW."lease_expires_at" := NULL;
    NEW."failure_code" := NULL;
  ELSIF NEW."status" = 'failed' THEN
    NEW."status" := 'retry_scheduled';
    NEW."completed_at" := NULL;
    NEW."deleted_types" := ARRAY[]::TEXT[];
    NEW."attempt_count" := GREATEST(COALESCE(NEW."attempt_count", 0), 1);
    NEW."last_attempt_at" := COALESCE(NEW."last_attempt_at", CURRENT_TIMESTAMP);
    NEW."next_attempt_at" := CURRENT_TIMESTAMP;
    NEW."lease_expires_at" := NULL;
    NEW."failure_code" := 'local_purge_failed';
  END IF;

  RETURN NEW;
END
$normalize_deletion_lifecycle$;

CREATE TRIGGER data_deletion_requests_lifecycle_trigger
  BEFORE INSERT OR UPDATE OF
    "status", "completed_at", "deleted_types", "requested_types"
  ON "data_deletion_requests"
  FOR EACH ROW EXECUTE FUNCTION normalize_deletion_lifecycle();


CREATE FUNCTION privacy_subject_ref_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $privacy_subject_ref_immutable$
BEGIN
  IF NEW."privacy_subject_ref" IS DISTINCT FROM OLD."privacy_subject_ref" THEN
    RAISE EXCEPTION 'privacy_subject_ref is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$privacy_subject_ref_immutable$;

CREATE TRIGGER users_privacy_subject_ref_immutable_trigger
  BEFORE UPDATE OF "privacy_subject_ref"
  ON "users"
  FOR EACH ROW EXECUTE FUNCTION privacy_subject_ref_immutable();


-- Apply the pseudonymization contract to every user-delete path, including an
-- older rolling API container. This is local evidence handling only.
CREATE FUNCTION pseudonymize_user_privacy_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $pseudonymize_user_privacy_evidence$
BEGIN
  UPDATE "consent_records"
  SET
    "ip_address" = NULL,
    "metadata" = jsonb_build_object('erasedOnAccountDeletion', TRUE),
    "subject_ref" = OLD."privacy_subject_ref"
  WHERE "user_id" = OLD."id";

  UPDATE "data_deletion_requests"
  SET
    "status" = 'completed',
    "completed_at" = COALESCE("completed_at", CURRENT_TIMESTAMP),
    "requested_types" = ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[],
    "deleted_types" = ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[],
    "attempt_count" = GREATEST("attempt_count", 1),
    "last_attempt_at" = COALESCE("last_attempt_at", CURRENT_TIMESTAMP),
    "next_attempt_at" = NULL,
    "lease_expires_at" = NULL,
    "failure_code" = NULL,
    "subject_ref" = OLD."privacy_subject_ref"
  WHERE "user_id" = OLD."id";

  -- Scrub the legacy pre-delete audit written by an older API.
  UPDATE "audit_log"
  SET
    "entity_id" = OLD."privacy_subject_ref"::TEXT,
    "metadata" = jsonb_build_object('scope', 'local_database_account_v1')
  WHERE "action" = 'delete_user'
    AND "entity_type" = 'user'
    AND "entity_id" = OLD."id";

  RETURN OLD;
END
$pseudonymize_user_privacy_evidence$;

CREATE TRIGGER users_pseudonymize_privacy_evidence_trigger
  BEFORE DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION pseudonymize_user_privacy_evidence();

COMMIT;
