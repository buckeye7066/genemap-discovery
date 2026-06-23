# CHANGELOG

## [audit/ux-repair] — 2026-06-23 (branch `fix/genemap-discovery-audit-ux-repair`)

### Preserved
- Validated and committed ~1,880 lines of prior, **uncommitted** backend/shared
  work (ApiError + envelope unwrapping, CSRF double-submit, project/admin/
  license authorization, encryption fail-closed) as commit `3db891a` after
  confirming lint/typecheck/tests/builds were green.

### Fixed
- **Search history never persisted**: `Search.jsx` posted Base44 snake_case
  fields; backend requires `{query,queryType,results}` → silent 400. Now correct.
- **Gene sets unsaveable from search**: routed `saveMedicalData` → `saveGeneSet`.
- **History page blank rows**: read Base44 field names the PG backend never
  returns; added a normalizer for the real shape.
- **Collaborator role injection**: constrained to `[editor,viewer]`, idempotent
  upsert, self-add rejected.
- **License seats**: reject duplicate active assignment; guard counter underflow.
- **Desktop build blocker**: generated `icon.{png,ico,icns}` (no new deps) and
  the missing PWA `icon-192/512`.

### Added
- `parseJsonFromLLM()` shared helper (fence/prose-tolerant, safe, validatable).
- LLM input bounds (prompt 24k chars, chat 50 msgs / 24k chars each).
- Genomic `fetchJSON` retry/backoff for transient upstream failures;
  `normalizeQuery` (length bound + case-folded cache keys); host-only errors.
- Intent-based, **role-gated** sidebar navigation; surfaced orphaned
  `TopicExplorer`.
- Beginner search entry point: example searches, jargon glossary, not-medical-
  advice notice.
- 23 backend tests (reliability + entities authorization) and a more faithful
  Prisma test mock (upsert/updateMany/atomic ops/compound keys).
- Eight audit reports at repo root.

### Validation
`pnpm lint` (0 errors) · `pnpm typecheck` · `pnpm test` (**207 passed**) ·
`pnpm --filter @genemap/shared build` · `pnpm build:web` — all green.

### Not done (documented in reports)
- Full Zod adoption across all entities/admin bodies.
- DB-level constraints/indexes (no `DATABASE_URL` in session; app-enforced).
- Frontend component/E2E tests.
- Full WCAG 2.1 AA pass.
- `electron-builder` packaging not executed (no runner); config verified statically.
