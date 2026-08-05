# CLAUDE.md - GeneMap Discovery

Genomic analysis platform. pnpm-workspaces monorepo migrated off Base44.

## Tech Stack

React 18 + Vite + Tailwind + Radix (`apps/web`), Electron (`apps/desktop`), Fastify 5.8 + Prisma 6.2 + PostgreSQL 18 (prod on Railway; CI tests against postgres:18) (`services/api`), shared TypeScript package (`packages/shared`), Anthropic/OpenAI wrappers, Stripe, JWT access/refresh tokens, bcrypt, and HTTP-only cookies.

## Run / Build / Test

```bash
pnpm dev              # API + web
pnpm dev:api          # Fastify API on :3000
pnpm dev:web          # Vite web app on :5173
pnpm dev:desktop      # Electron shell
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm db:push
pnpm db:migrate
pnpm db:migrate:deploy
pnpm db:studio
pnpm launch:verify    # pre-deploy gate (scripts/verify-production-launch.mjs); also baked into typecheck
```

Toolchain floor: Node >=24 + corepack/pnpm required (root `engines`) — Node 20 fails.

## Entry Points

- Frontend: `apps/web/main.jsx` -> `App.jsx`
- Backend: `services/api/src/index.js`
- Desktop: `apps/desktop/main.js`
- Shared: `packages/shared/src/index.ts`

## Directory Map

- `apps/web/` - main React app, pages, components, AuthContext, QueryClient
- `apps/desktop/` - Electron desktop shell that loads the built web app
- `services/api/src/` - Fastify bootstrap, config, middleware, routes, services, utils
- `services/api/prisma/` - schema and migrations
- `packages/shared/src/` - ApiClient, schemas, and shared types
- `docs/audits/` - historical point-in-time audit reports

## Where Things Live

| Task | Location |
|---|---|
| Auth | `services/api/src/routes/auth.js` + `services/api/src/middleware/auth.js` |
| DB schema | `services/api/prisma/schema.prisma` |
| Env vars | `services/api/src/config/env.js` |
| AI wrappers | `services/api/src/services/anthropic.js`, `openai.js`, `llm.js` |
| AI honesty guard rails | `services/api/src/services/scientificHonesty.js` — one directive injected (system message / prompt prefix) into every AI path: `education.js` (explain/quiz/chat) + `llm.js` proxy (invoke/chat) |
| Genomics | `services/api/src/routes/genomics.js`, `services/api/src/services/genomicDatabases.js`, `vcf.js` |
| Shared client | `packages/shared/src/client.ts` |
| Stripe webhooks | `services/api/src/routes/billing.js` |
| Rate-limit store | `services/api/src/config/rateLimitStore.js` — optional `REDIS_URL` (ioredis) backs it; in-memory otherwise |
| Error monitoring | Sentry (`@sentry/node`, `services/api/src/config/sentry.js`) wired into `index.js` + `middleware/errorHandler.js` |

## Nightly self-test sweep (agents v1)

`scripts/agents/nightly-sweep.mjs` — GrantFlow-style self-testing/self-correcting loop, right-sized for this repo. Runs the REAL gates (`pnpm lint`, `pnpm typecheck`, `pnpm test`), then starts API+web dev servers (or reuses running ones) and runs the Playwright journey set (`apps/web/tests/e2e`, `PLAYWRIGHT_BASE_URL=http://localhost:5173`) — including the EVA regression journeys in `login-journeys.spec.js`: login loads console-clean with zero failed requests, and registration is reachable from /Login via EVA's verbatim locator.

- **Auto-fix lane (safe classes only):** if lint fails AND the tree was clean at sweep start, runs `eslint --fix`, re-runs the FULL gate (incl. e2e), and only then commits — on an `agents/autofix-*` branch (pushed for review unless `--no-push`), never on the current branch/main. Re-gate failure → fix reverted, finding reported. Dirty tree → auto-fix skipped entirely.
- **Findings report (Anya-style):** `reports/agents/nightly-<date>.md` + `latest.json` (health score 0–100 weighted lint 15 / typecheck 25 / unit 30 / e2e 30, needs-attention tails). Directory is gitignored (runtime output).
- **Schedule:** Windows scheduled task "GeneMap Nightly Sweep", daily 03:00, runs `scripts/agents/nightly-sweep.cmd` (logs to `reports/agents/last-run.log`). Manage with `schtasks /Query|/Run|/Delete /TN "GeneMap Nightly Sweep"`.
- **Local DB:** the local API's `services/api/.env` points `DATABASE_URL` at the shared `eva-postgres` Docker container (`postgresql://eva:eva@localhost:5433/genemap_eva`) — NOT the native :5432 Postgres (its credentials don't match; that mismatch silently 500'd every local register/login until 2026-08-02).
- Flags: `--no-push` (autofix branch stays local), `--no-servers` (never spawn servers), `--skip-e2e`.
- Trap: probe dev servers via host `localhost`, not `127.0.0.1` — Vite binds only `::1` on this box.

## Gotchas

- Base44 Deno functions have been removed from the active tree.
- `pnpm dev` starts API and web together; desktop is separate.
- API baseURL fallback in `client.ts`: `VITE_API_URL` -> localhost API in local browser -> same-origin proxy.
- Medical data encryption requires a 64-character hex `MEDICAL_DATA_ENCRYPTION_KEY` in production.
- Stripe price IDs must come from server env; do not trust client-supplied price IDs.
- `genemap-api`'s Railway service had no GitHub source connected until 2026-07-05 (`source.repo` was null) — every "deploy" was actually a manual `railway up` after merging to main. Reconnected via Railway's GraphQL `serviceConnect` mutation (repo `buckeye7066/genemap-discovery`, branch `main`) and confirmed a real auto-triggered deployment fired within seconds of a merge. Should now auto-deploy on merge like a normal Railway+GitHub setup, but verify with `railway status --json` (`source.repo`) or deployment timestamps after any high-stakes merge, since this had silently regressed before.
