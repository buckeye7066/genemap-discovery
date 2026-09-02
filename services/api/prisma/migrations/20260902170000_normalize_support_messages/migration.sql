-- Earlier web builds labeled Contact Support submissions as `general` or
-- `issue`, while the administrator inbox queried only `support`. Normalize
-- those top-level records so already-submitted requests become visible, and
-- preserve the issue flag in metadata for the admin UI.
UPDATE "messages"
SET
  "metadata" = COALESCE("metadata", '{}'::jsonb)
    || jsonb_build_object('isIssue', "category" = 'issue'),
  "category" = 'support'
WHERE "parent_id" IS NULL
  AND "category" IN ('general', 'issue');
