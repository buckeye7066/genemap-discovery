# BUG_REGISTRY — GeneMap Discovery audit (branch `fix/genemap-discovery-audit-ux-repair`)

Severity: **C**ritical / **H**igh / **M**edium / **L**ow.
Verification commands are run from the repo root with pnpm 9.

> Context: a prior session had already fixed a large amount of backend/shared
> contract drift and security but left it **uncommitted and unvalidated** on
> `main`. That work was validated green and preserved as commit `3db891a`
> before any new changes. Bugs below `B-100` are the genuinely-remaining ones
> this audit fixed; the `B-0xx` block documents what the preserved baseline
> already addressed (verified, not re-fixed).

## Newly fixed this session

| ID | File | Sev | Category | Root cause | Fix | Verify | Result |
|----|------|-----|----------|-----------|-----|--------|--------|
| B-101 | apps/web/pages/Search.jsx | C | API contract | `saveSearchHistory` sent Base44 snake_case `{phenotype_query,...}`; backend POST `/entities/search-history` requires `query` → threw 400, swallowed by a `try/catch` that only `log.debug`'d. Search history silently never saved. | Send `{query, queryType, results:{hpoTerm,candidateGenes,count}}` matching the real contract. | `pnpm --filter @genemap/api test` (search-history shape covered) + web build | PASS |
| B-102 | apps/web/pages/Search.jsx | H | API contract / data | `handleSaveGeneSet` called `saveMedicalData` (requires `dataType`+`content`, gated behind a HIPAA consent record) to store a gene set → 400/403; gene sets could never be saved from search. | Call `saveGeneSet({name,description,genes,metadata})` (POST `/entities/gene-sets`). | web typecheck/build; manual flow trace | PASS |
| B-103 | apps/web/pages/History.jsx | H | API contract | Page read snake_case fields (`phenotype_query`, `search_type`, `results_count`, `candidate_genes`, `created_date`) the PG backend never returns → every row rendered blank/zeroed. | Added `normalizeEntry()` mapping the real `{query,queryType,results,createdAt}` shape (tolerant of legacy rows). | web typecheck/build | PASS |
| B-104 | apps/web/Layout.jsx | M | security (UX) / a11y | Admin nav group (9 links) rendered for **every** user; `TopicExplorer` page existed but was absent from nav. | Role-gate Admin via `useAuth()` (admin/super_admin; Admin Setup super_admin-only); regroup nav by intent; surface TopicExplorer. | web build | PASS |
| B-105 | services/api/src/routes/entities.js | H | security | Collaborator `role` accepted any string (DB column is free-form) → `role:"owner"`/`"admin"` injection. Also non-idempotent create could P2002-crash on double submit; owner could be added as own collaborator. | Constrain to enum `[editor,viewer]`; reject self; `upsert` on the `(projectId,userId)` unique key. | `entities-authz.test.js` (3 tests) | PASS |
| B-106 | services/api/src/routes/entities.js | M | data integrity | License seat assignment allowed a duplicate active seat for the same user (double seat consumption); seat counter could underflow on release. | Reject duplicate active assignment inside the txn; guard decrement with `assignedSeats > 0`. | `entities-authz.test.js` (4 tests) | PASS |
| B-107 | services/api/src/services/genomicDatabases.js | M | reliability | No retry on transient upstream failures; case-sensitive cache keys (`BRCA1`≠`brca1`); unbounded query length; full upstream URL in thrown error. | `fetchJSON` retries 408/429/5xx/network with backoff, host-only errors; `normalizeQuery` trims/lowercases/bounds to 256 chars. | `reliability.test.js` (normalizeQuery) | PASS |
| B-108 | services/api/src/services/llm.js | M | reliability | Each call site re-implemented regex + bare `JSON.parse` on model output → a stray ```` ```json ```` fence or trailing prose silently broke quiz generation. | Shared `parseJsonFromLLM()` (strips fences, extracts JSON, safe-parse, optional validator). | `reliability.test.js` (6 tests) | PASS |
| B-109 | services/api/src/routes/llm.js | M | reliability / cost | Output tokens were clamped but **input** was unbounded — a multi-MB prompt or 10k-message array reached the provider. | Bound prompt to 24k chars, chat to 50 messages / 24k chars each. | `reliability.test.js` (route bounds) | PASS |
| B-110 | apps/desktop (no icons) | H | desktop build | `icons/icon.{ico,icns,png}` referenced by electron-builder + main.js did not exist → `pnpm build:desktop` hard-fails. PWA `icon-192.png` referenced by Layout was also missing. | Dependency-free `generate-icons.mjs` (zlib PNG encoder + ico/icns wrappers); wired into build scripts; `icons/**` packaged. | `node apps/desktop/scripts/generate-icons.mjs` + header/round-trip validation | PASS |
| B-111 | apps/web/pages/Search.jsx | L | UX | Empty search state gave no examples, jargon help, or medical-advice notice. | Added clickable examples, glossary, not-medical-advice notice. | web build | PASS |

## Preserved baseline (commit `3db891a`) — verified, already fixed

| ID | Area | What it fixed |
|----|------|---------------|
| B-001 | packages/shared/src/client.ts | `ApiError` subclass preserving `status`/`code`/`details`; every method unwraps its envelope (`{entries}`,`{sets}`,`{records}`,…) to the typed value. CSRF token injected on mutating requests. |
| B-002 | apps/web/lib/AuthContext.jsx | `error.status===403 && error.code==='user_not_registered'` now works (ApiError carries those fields). |
| B-003 | services/api routes/entities.js | `requireProjectAccess()` gates project versions/annotations/collaborators (IDOR closed); collaborator delete bound to projectId. |
| B-004 | services/api routes/admin.js | `grant-admin` is `super_admin`-only; self-delete/self-ban blocked; admin cannot ban a super_admin; destructive actions audit-logged (`required:true`). |
| B-005 | services/api utils/encryption.js | Fail-closed in production (throws if key missing/malformed); legacy plaintext auto-detected on read. |
| B-006 | services/api middleware/csrf.js | HMAC double-submit token bound to userId; webhook + auth exempt. |

## Second pass — completed (was previously "known-remaining")
| ID | Area | Fix | Verify | Result |
|----|------|-----|--------|--------|
| B-112 | entities.js write routes | Reusable `assertString`/`assertStringArray`/`assertJsonSize` bounds + boolean/enum checks on search-history, activity, medical-data, conversations, gene-sets, projects, messages, annotations, consent. | `entities-authz.test.js` (+4) | PASS |
| B-113 | prisma schema + migration | `sessions_expires_at_idx`, `data_deletion_requests_status_requested_at_idx`, partial-unique `license_assignments_active_user_unique`. | `prisma validate` / `format` | PASS (apply via `migrate deploy`) |
| B-114 | apps/web (no test runner) | Wired Vitest+jsdom+RTL; extracted `lib/searchHistory.js`+`lib/roles.js`; 11 web tests incl. History render. | `pnpm --filter @genemap/web test` | PASS (11) |
| B-115 | apps/web a11y | Global `prefers-reduced-motion` + `:focus-visible` ring; aria-labels on icon-only buttons. | web build | PASS |
| B-116 | dependency vulns | 59 → 5 (1 critical/22 high → 0/0) via overrides + electron 39 / react-router 7.18 / vite 6.4.3 bumps. | `pnpm audit` | PASS |

## Genuinely remaining (blockers / future PR)
- `electron-builder` packaging not executed (no signing/runner); electron bumped + icons fixed but a desktop smoke test is needed. **L**
- Full WCAG 2.1 AA sweep (reduced-motion/focus/key aria-labels done; not a complete per-page contrast/aria audit). **L**
- Playwright E2E; consolidating inline bounds into shared `packages/shared` Zod schemas; a scheduled expired-session prune job. **L**
- LLM services have no provider-level retry/backoff (genomics does). **L**
