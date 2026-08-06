-- Preserve local privacy evidence after account deletion and make the finite
-- legacy-content purge retryable. subject_ref is the existing opaque user UUID:
-- pseudonymous local linkage, not anonymous data and not a restore tombstone.

ALTER TABLE "consent_records"
  ADD COLUMN "subject_ref" TEXT;

UPDATE "consent_records"
SET "subject_ref" = "user_id"::TEXT;

ALTER TABLE "consent_records"
  ALTER COLUMN "subject_ref" SET NOT NULL,
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "consent_records"
  DROP CONSTRAINT "consent_records_user_id_fkey";

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "consent_records_subject_ref_consent_type_created_at_idx"
  ON "consent_records"("subject_ref", "consent_type", "created_at");


ALTER TABLE "data_deletion_requests"
  ADD COLUMN "subject_ref" TEXT,
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'legacy_content_v1',
  ADD COLUMN "requested_types" TEXT[] NOT NULL
    DEFAULT ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[],
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_attempt_at" TIMESTAMP(3),
  ADD COLUMN "next_attempt_at" TIMESTAMP(3),
  ADD COLUMN "lease_expires_at" TIMESTAMP(3),
  ADD COLUMN "failure_code" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "data_deletion_requests"
SET
  "subject_ref" = "user_id"::TEXT,
  "requested_types" = ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[],
  "deleted_types" = CASE
    WHEN "status" = 'completed' THEN ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE("deleted_types", ARRAY[]::TEXT[])) AS value
      WHERE value = ANY(ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[])
    )
    ELSE ARRAY[]::TEXT[]
  END,
  "completed_at" = CASE
    WHEN "status" = 'completed' THEN COALESCE("completed_at", "requested_at")
    ELSE NULL
  END,
  "next_attempt_at" = CASE
    WHEN "status" IN ('pending', 'failed') THEN CURRENT_TIMESTAMP
    ELSE NULL
  END,
  "failure_code" = CASE
    WHEN "status" = 'failed' THEN 'local_purge_failed'
    ELSE NULL
  END,
  "updated_at" = COALESCE("completed_at", "requested_at", CURRENT_TIMESTAMP),
  "status" = CASE
    WHEN "status" = 'pending' THEN 'pending'
    WHEN "status" = 'completed' THEN 'completed'
    WHEN "status" = 'failed' THEN 'retry_scheduled'
    ELSE 'operator_review'
  END;

ALTER TABLE "data_deletion_requests"
  ALTER COLUMN "subject_ref" SET NOT NULL,
  ALTER COLUMN "updated_at" SET NOT NULL,
  ALTER COLUMN "deleted_types" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "data_deletion_requests"
  DROP CONSTRAINT "data_deletion_requests_user_id_fkey";

ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "data_deletion_requests_status_requested_at_idx";

CREATE INDEX "data_deletion_requests_subject_ref_requested_at_idx"
  ON "data_deletion_requests"("subject_ref", "requested_at");

CREATE INDEX "data_deletion_requests_status_next_attempt_at_idx"
  ON "data_deletion_requests"("status", "next_attempt_at");

ALTER TABLE "data_deletion_requests"
  ADD CONSTRAINT "data_deletion_requests_status_check"
    CHECK ("status" IN ('pending', 'processing', 'retry_scheduled', 'completed', 'operator_review')),
  ADD CONSTRAINT "data_deletion_requests_scope_check"
    CHECK ("scope" = 'legacy_content_v1'),
  ADD CONSTRAINT "data_deletion_requests_attempt_count_check"
    CHECK ("attempt_count" >= 0),
  ADD CONSTRAINT "data_deletion_requests_requested_types_check"
    CHECK (
      cardinality("requested_types") = 3
      AND "requested_types" @> ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[]
      AND "requested_types" <@ ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[]
    ),
  ADD CONSTRAINT "data_deletion_requests_deleted_types_check"
    CHECK (
      "deleted_types" <@ ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[]
    ),
  ADD CONSTRAINT "data_deletion_requests_failure_code_check"
    CHECK ("failure_code" IS NULL OR "failure_code" = 'local_purge_failed'),
  ADD CONSTRAINT "data_deletion_requests_state_check"
    CHECK (
      (
        "status" = 'pending'
        AND "completed_at" IS NULL
        AND "lease_expires_at" IS NULL
      )
      OR (
        "status" = 'processing'
        AND "completed_at" IS NULL
        AND "lease_expires_at" IS NOT NULL
      )
      OR (
        "status" = 'retry_scheduled'
        AND "completed_at" IS NULL
        AND "lease_expires_at" IS NULL
        AND "next_attempt_at" IS NOT NULL
      )
      OR (
        "status" = 'completed'
        AND "completed_at" IS NOT NULL
        AND "lease_expires_at" IS NULL
      )
      OR (
        "status" = 'operator_review'
        AND "completed_at" IS NULL
        AND "lease_expires_at" IS NULL
      )
    );
