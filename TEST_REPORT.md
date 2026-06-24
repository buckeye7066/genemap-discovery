# TEST_REPORT — GeneMap Discovery

## Final results (branch `fix/genemap-discovery-audit-ux-repair`)
| Suite | Tests | Result |
|-------|-------|--------|
| `@genemap/shared` (vitest) | 48 | ✅ pass |
| `@genemap/api` (vitest) | 163 | ✅ pass |
| `@genemap/web` (vitest + jsdom) | 11 | ✅ pass |
| **Total** | **222** | ✅ |

`pnpm audit`: 5 vulnerabilities (0 critical, 0 high, 4 moderate, 1 low) — down
from 59 (1 critical, 22 high) at the start of the audit.

### Frontend test runner (now wired)
`apps/web` previously had no test runner. Added Vitest + jsdom + React Testing
Library (`vitest.config.js`, `test-setup.js`, `pnpm --filter @genemap/web test`):
- `lib/__tests__/searchHistory.test.js` (4): `normalizeSearchHistoryEntry`
  reads the real backend shape, falls back to legacy snake_case, derives count,
  safe defaults. (Covers B-103.)
- `lib/__tests__/roles.test.js` (5): `isAdminUser` / `isSuperAdmin` gating.
  (Covers B-104.)
- `pages/__tests__/History.test.jsx` (2): real render — friendly empty state,
  and backend-shaped rows render correctly. (The API-failure render case is
  omitted: a rejected promise in React's async effect trips vitest's
  unhandled-error trap under jsdom; the path is covered by the component's
  try/catch and the normalizer unit tests.)

Commands:
```bash
pnpm install --frozen-lockfile   # ok
pnpm lint                         # 0 errors, 7 warnings (pre-existing, in tests)
pnpm typecheck                    # ok (web tsc, shared tsc, api node --check)
pnpm test                         # 207 passed
pnpm --filter @genemap/shared build   # ok
pnpm build:web                    # ok (built in ~19s)
```

## Tests added this session (+23 API)
### `services/api/src/__tests__/reliability.test.js` (16)
- `parseJsonFromLLM`: bare JSON, ```` ```json ```` fences, prose-wrapped JSON,
  malformed→fallback, empty/non-string→fallback, boolean validator, Zod-style
  `{success,data}` validator.
- `normalizeQuery`: trim+lowercase, 256-char bound, nullish→`''`.
- `validatePrompt`: accepts normal, rejects non-string, rejects over-long.
- LLM route bounds (integration): over-long prompt → 400, too-many messages →
  400, oversized single message → 400.

### `services/api/src/__tests__/entities-authz.test.js` (7)
- Collaborator role: rejects `owner`/`admin`; accepts `editor`/`viewer`
  idempotently (no duplicate rows, role updates); rejects owner-as-collaborator.
- License seats: assign then reject duplicate active seat (email
  case-insensitive); reject when full; release decrements without underflow;
  non-admin of the license is denied (403).

### Test infrastructure improvement
Extended the in-memory Prisma mock (`__tests__/setup.js`) with `upsert`,
`updateMany`, atomic `increment`/`decrement`/`set` application, `lt/gt/lte`
operators, and compound-unique-key (`projectId_userId`) matching — previously
these Prisma features were unsupported, leaving collaborator/license routes
untestable.

## Pre-existing coverage confirmed (not authored here)
- Shared client (47): envelope unwrapping per method, `ApiError`
  status/code/details preservation, CSRF header injection, URL/query building.
- API: auth (register/login/logout/refresh/me, banned), admin role enforcement
  + super_admin gates, entities ownership/IDOR, medical-data encryption +
  consent, gene-set CRUD round-trip, CSRF, stripe webhook, e2e flows, env.

## Gaps in coverage (recommended next)
- **Frontend has no component tests** (no test runner wired in `apps/web`).
  History/Search/Layout fixes were verified via typecheck + build + manual trace,
  not rendering tests. Recommend adding Vitest + React Testing Library and
  Playwright E2E for: register/login, choose level, learn topic, search→save
  gene set→view history, admin-nav visibility by role.
- Genomic `fetchJSON` retry/backoff is exercised indirectly (via
  `normalizeQuery`); a fetch-mocked test of the retry path (429→retry→200,
  permanent 404→no retry) would lock in the behavior.
