-- Project version snapshots.
--
-- WHY: `project_versions.changes` is a DELTA log — it stores the request body
-- of the update that produced the version, not the resulting project state.
-- The Research Mode "Restore this version" button read a `snapshot_data` field
-- that never existed, spread `undefined` into the update payload, and the
-- server (which destructures only known keys) accepted the empty update and
-- returned 200. The UI then reported success. Nothing was restored.
--
-- A silent no-op reported as success is the worst failure mode we ship, so the
-- fix is to make restore genuinely possible: capture the full project state on
-- every version row.
--
-- NULLABLE ON PURPOSE, AND DELIBERATELY NOT BACKFILLED. Rows written before
-- this migration have no recoverable prior state — `changes` cannot be replayed
-- into a snapshot without inventing the fields the delta never carried.
-- Guessing one would be exactly the fabrication this codebase forbids. A NULL
-- snapshot means "this version predates snapshot capture"; the UI refuses the
-- restore and says so, rather than appearing to succeed.

ALTER TABLE "project_versions" ADD COLUMN "snapshot" JSONB;

COMMENT ON COLUMN "project_versions"."snapshot" IS
  'Full project state at this version (title, description, status, genes, metadata). NULL = pre-2026-08-25 row, not restorable.';
