#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_root="$repo_root/services/api/prisma/migrations"
target="$migration_root/20260806130000_privacy_deletion_lifecycle/migration.sql"

if [[ ! -f "$target" ]]; then
  echo "privacy lifecycle migration is missing" >&2
  exit 1
fi

mapfile -t prior_migrations < <(
  find "$migration_root" -mindepth 2 -maxdepth 2 -name migration.sql \
    ! -path "$target" -print | sort
)

for migration in "${prior_migrations[@]}"; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO "users" ("id", "email", "password_hash", "role", "updated_at")
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'migration-subject@example.invalid',
  'test-only-hash',
  'user',
  CURRENT_TIMESTAMP
);

INSERT INTO "consent_records" (
  "id", "user_id", "consent_type", "version", "granted", "ip_address", "metadata"
)
VALUES (
  'consent-upgrade',
  '11111111-1111-4111-8111-111111111111',
  'research',
  '1.0',
  TRUE,
  '192.0.2.44',
  '{"fixture":"private"}'::JSONB
);

INSERT INTO "data_deletion_requests" (
  "id", "user_id", "status", "requested_at", "completed_at", "deleted_types"
)
VALUES
  (
    'deletion-pending',
    '11111111-1111-4111-8111-111111111111',
    'pending',
    CURRENT_TIMESTAMP - INTERVAL '3 hours',
    NULL,
    ARRAY['caller-controlled-legacy']::TEXT[]
  ),
  (
    'deletion-failed',
    '11111111-1111-4111-8111-111111111111',
    'failed',
    CURRENT_TIMESTAMP - INTERVAL '2 hours',
    NULL,
    ARRAY['medicalData']::TEXT[]
  ),
  (
    'deletion-completed',
    '11111111-1111-4111-8111-111111111111',
    'completed',
    CURRENT_TIMESTAMP - INTERVAL '1 hour',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes',
    ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[]
  );
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$target" >/dev/null

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DO $privacy_upgrade$
DECLARE
  subject_id CONSTANT TEXT := '11111111-1111-4111-8111-111111111111';
  privacy_ref UUID;
  row_record RECORD;
BEGIN
  SELECT "privacy_subject_ref" INTO privacy_ref
  FROM "users" WHERE "id" = subject_id;
  IF privacy_ref IS NULL THEN
    RAISE EXCEPTION 'independent privacy subject was not backfilled';
  END IF;

  SELECT * INTO row_record FROM "consent_records" WHERE "id" = 'consent-upgrade';
  IF row_record."subject_ref" <> privacy_ref OR row_record."user_id" <> subject_id THEN
    RAISE EXCEPTION 'consent subject reference was not backfilled';
  END IF;

  SELECT * INTO row_record FROM "data_deletion_requests" WHERE "id" = 'deletion-pending';
  IF row_record."status" <> 'pending'
     OR row_record."subject_ref" <> privacy_ref
     OR row_record."next_attempt_at" IS NULL
     OR cardinality(row_record."deleted_types") <> 0 THEN
    RAISE EXCEPTION 'pending deletion backfill is incorrect';
  END IF;

  SELECT * INTO row_record FROM "data_deletion_requests" WHERE "id" = 'deletion-failed';
  IF row_record."status" <> 'retry_scheduled'
     OR row_record."next_attempt_at" IS NULL
     OR row_record."failure_code" <> 'local_purge_failed'
     OR cardinality(row_record."deleted_types") <> 0 THEN
    RAISE EXCEPTION 'failed deletion was not converted to a retry';
  END IF;

  SELECT * INTO row_record FROM "data_deletion_requests" WHERE "id" = 'deletion-completed';
  IF row_record."status" <> 'completed'
     OR row_record."completed_at" IS NULL
     OR cardinality(row_record."deleted_types") <> 3 THEN
    RAISE EXCEPTION 'completed deletion evidence was not preserved';
  END IF;

  -- Legacy-style writes omit every newly added column. Defaults and triggers
  -- must keep those writes safe during a rolling deployment.
  INSERT INTO "consent_records" (
    "id", "user_id", "consent_type", "version", "granted"
  )
  VALUES ('consent-legacy-write', subject_id, 'research', '1.0', FALSE);

  INSERT INTO "data_deletion_requests" (
    "id", "user_id", "status", "deleted_types"
  )
  VALUES (
    'deletion-legacy-write',
    subject_id,
    'pending',
    ARRAY['rolling-client-canary']::TEXT[]
  );

  SELECT * INTO row_record
  FROM "data_deletion_requests" WHERE "id" = 'deletion-legacy-write';
  IF row_record."subject_ref" <> privacy_ref
     OR row_record."status" <> 'pending'
     OR cardinality(row_record."deleted_types") <> 0
     OR row_record."updated_at" IS NULL THEN
    RAISE EXCEPTION 'legacy deletion insert was not normalized';
  END IF;

  -- A status-only write must never manufacture completion evidence.
  BEGIN
    UPDATE "data_deletion_requests"
    SET "status" = 'completed', "completed_at" = NULL
    WHERE "id" = 'deletion-pending';
    RAISE EXCEPTION 'timestamp-less completion was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  IF (
    SELECT COUNT(*)
    FROM pg_constraint
    WHERE conname IN (
      'data_deletion_requests_requested_types_check',
      'data_deletion_requests_state_evidence_check'
    )
  ) <> 2 THEN
    RAISE EXCEPTION 'declarative deletion evidence constraints are missing';
  END IF;

  DELETE FROM "users" WHERE "id" = subject_id;

  IF (
    SELECT COUNT(*) FROM "consent_records"
    WHERE "subject_ref" = privacy_ref
      AND "user_id" IS NULL
      AND "ip_address" IS NULL
      AND "metadata" = '{"erasedOnAccountDeletion":true}'::JSONB
  ) <> 2 THEN
    RAISE EXCEPTION 'consent evidence did not survive in scrubbed form';
  END IF;

  IF (
    SELECT COUNT(*) FROM "data_deletion_requests"
    WHERE "subject_ref" = privacy_ref
      AND "user_id" IS NULL
      AND "status" = 'completed'
      AND cardinality("deleted_types") = 3
  ) <> 4 THEN
    RAISE EXCEPTION 'deletion evidence did not survive account deletion';
  END IF;

  -- Once the FK has nulled user_id, the retained pseudonym cannot be changed
  -- or relinked to manufacture a different evidence chain.
  BEGIN
    UPDATE "consent_records"
    SET "subject_ref" = gen_random_uuid()
    WHERE "id" = 'consent-upgrade';
    RAISE EXCEPTION 'orphaned subject_ref mutation was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "data_deletion_requests" (
      "id", "user_id", "subject_ref", "scope", "status",
      "requested_at", "requested_types", "deleted_types",
      "attempt_count", "updated_at"
    )
    VALUES (
      'invalid-status',
      NULL,
      privacy_ref,
      'legacy_content_v1',
      'free_form_status',
      CURRENT_TIMESTAMP,
      ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[],
      ARRAY[]::TEXT[],
      0,
      CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'invalid lifecycle status was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$privacy_upgrade$;
SQL

echo "privacy migration upgrade fixture passed"
