# TEST_REPORT — GeneMap Discovery

## Final results (branch `fix/genemap-discovery-audit-ux-repair`)
| Suite | Tests | Result |
|-------|-------|--------|
| `@genemap/shared` (vitest) | 48 | ✅ pass |
| `@genemap/api` (vitest) | 159 | ✅ pass |
| **Total** | **207** | ✅ |

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
