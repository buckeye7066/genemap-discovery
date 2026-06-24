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

### Second pass — completion (same branch)
- **Input bounds** added across entities write routes (search-history, activity,
  medical-data, conversations, gene-sets, projects, messages, annotations,
  consent): string/array/JSON-size guards + boolean/enum checks. Closes the
  unbounded-body DoS vector. (+4 API tests.)
- **DB migration shipped**: `20260623190000_session_deletion_indexes_seat_unique`
  adds `sessions_expires_at_idx`, `data_deletion_requests_status_requested_at_idx`,
  and a **partial unique index** enforcing one active seat per (license,user).
  Schema updated to match (the two named indexes); partial-unique documented as
  migration-only (Prisma can't express it).
- **Frontend test runner wired** (Vitest + jsdom + Testing Library): extracted
  `lib/searchHistory.js` + `lib/roles.js` (used by History/Layout) and added 11
  web tests, including a real History render test (empty + populated states).
- **Accessibility**: global `prefers-reduced-motion` neutralization + a
  keyboard `:focus-visible` ring (index.css); aria-labels on icon-only buttons.
- **Dependency vulns**: 59 → **5** (1 critical + 22 high → **0 critical, 0 high**;
  remaining 5 are moderate/low). Bumped vitest≥3.2.6, vite 6.4.3, react-router(-dom)
  7.18, electron 39.8.x, flatted/xmldom/tmp/form-data/esbuild via overrides.

### Final validation (second pass)
`pnpm lint` (0 errors) · `pnpm typecheck` · `pnpm test` (**222 passed** — 163 API
+ 48 shared + 11 web) · shared build · `pnpm build:web` · icon generation —
all green. `pnpm audit`: 0 critical / 0 high.

### Still not done (genuine blockers / out of scope)
- `electron-builder` packaging not executed (no signing/runner here); icon
  blocker fixed + electron bumped, but a desktop smoke test needs a real run.
- Full WCAG 2.1 AA audit (did reduced-motion, focus-visible, key aria-labels —
  not a complete contrast/aria sweep of every page).
- E2E (Playwright) flows; deeper Zod *schemas* in `packages/shared` shared with
  the client (bounds are enforced server-side inline instead).
