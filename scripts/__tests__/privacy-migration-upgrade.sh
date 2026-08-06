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
    NULL,
    ARRAY['medicalData', 'aiConversations', 'searchHistory']::TEXT[]
  );
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$target" >/dev/null

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DO $privacy_upgrade$
DECLARE
  subject_id CONSTANT TEXT := '11111111-1111-4111-8111-111111111111';
  row_record RECORD;
BEGIN
  SELECT * INTO row_record FROM "consent_records" WHERE "id" = 'consent-upgrade';
  IF row_record."subject_ref" <> subject_id OR row_record."user_id" <> subject_id THEN
    RAISE EXCEPTION 'consent subject reference was not backfilled';
  END IF;

  SELECT * INTO row_record FROM "data_deletion_requests" WHERE "id" = 'deletion-pending';
  IF row_record."status" <> 'pending'
     OR row_record."subject_ref" <> subject_id
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

  DELETE FROM "users" WHERE "id" = subject_id;

  IF EXISTS (
    SELECT 1 FROM "consent_records"
    WHERE "id" = 'consent-upgrade'
      AND ("user_id" IS NOT NULL OR "subject_ref" <> subject_id)
  ) THEN
    RAISE EXCEPTION 'consent evidence did not survive account deletion';
  END IF;

  IF (
    SELECT COUNT(*) FROM "data_deletion_requests"
    WHERE "subject_ref" = subject_id AND "user_id" IS NULL
  ) <> 3 THEN
    RAISE EXCEPTION 'deletion evidence did not survive account deletion';
  END IF;

  BEGIN
    INSERT INTO "data_deletion_requests" (
      "id", "user_id", "subject_ref", "scope", "status",
      "requested_at", "requested_types", "deleted_types",
      "attempt_count", "updated_at"
    )
    VALUES (
      'invalid-status',
      NULL,
      subject_id,
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
