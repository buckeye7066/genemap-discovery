# CLAUDE.md - GeneMap Discovery

Genetics **education and exploratory-research** platform (LEARN / DISCOVER /
RESEARCH). pnpm-workspaces monorepo migrated off Base44.

It is **not** a diagnostic, medical-record, pharmacogenomic, treatment,
screening, or clinical-trial product. Read
**[PROJECT-BRIEF.md](PROJECT-BRIEF.md)** before assuming a capability ships:
several exist in backend code but are gated off for publication, and §5 of that
brief lists each one with its reason. Backend code existing is never a reason to
enable a route.

## Publication boundary (load-bearing — do not weaken to land a feature)

| Piece | File | What it guarantees |
|---|---|---|
| Fail-closed boundary | `services/api/src/config/publishingBoundary.js` | `HIGH_RISK_CLINICAL_FEATURES_ENABLED = false`. Model execution is authorized ONLY by `ROUTE_OWNED_TASKS` (server-owned) or `CLIENT_TASK_ROUTES` (versioned structured task). Arbitrary prompt text is never authorization. `HIDDEN_PATH_PREFIXES` 404s `/clinical-trials`, `/genomics/vcf`, `/genomics/variant`, `/genomics/clinvar`, `/entities/medical-data`, `/entities/conversations`, `/admin/self-test`. Both hooks are global, installed at `src/index.js` **before** any route registers. |
| Genomic guard | `services/api/src/services/genomicGuard.js` | Raw genomic content cannot reach a cloud model without a current `genomic_llm_upload` v1.0 consent (latest record wins, so revocation supersedes). |
| Scientific honesty | `services/api/src/services/scientificHonesty.js` | Every model call is wrapped with the honesty directive. |
| Route map | `apps/web/pages.config.js` | The ONLY authorization for a page to ship. Deliberately omits MedicalData, VCFAnalysis, AIAssistants, Anastasia, RobertClinical, VisualizationHub, GSEA from both the route map AND the lazy-import graph. Read the comment at the bottom of that file before touching it. |

### Two gates enforce the above; both must stay green

- `scripts/verify-publication-bundle.mjs` (wired into `pnpm release:check`) —
  **denylist** of forbidden chunks/strings **plus an allowlist**: (A) any dist
  chunk named after a module in `apps/web/pages/` must be in the `PAGES` route
  map; (B) every page module on disk must be routed or declared in
  `unroutedPageReasons` with a written reason; (C) the lazy-import graph and the
  route map must name exactly the same pages. Stale exclusions also fail.
- `services/api/src/__tests__/routeBoundaryCoverage.test.js` — walks
  `services/api/src/routes/`, derives model-capability from the **real import
  graph** (provider packages `@anthropic-ai/sdk` / `openai`; the choke point is
  `services/llm.js`), and fails if a path declared by a model-capable route file
  is not in `ROUTE_OWNED_TASKS`, `CLIENT_TASK_ROUTES`,
  `SAFE_NON_GENERATION_EDUCATION_ROUTES`, `HIDDEN_PATH_PREFIXES`, or
  `BOUNDARY_COVERAGE_ALLOWLIST` (which requires a written reason).
  **Why it exists:** `isUnknownGenerationRoute` in the boundary only covers the
  `/llm` and `/education` prefixes. A generation route mounted under a *new*
  prefix (e.g. `/research/generate`) gets `null` from
  `publicationBoundaryDecision` — verified by direct call — so the boundary alone
  would let it through. This sweep is what catches it.

Do not widen the model-capability detector, add a dry-run/report-only mode, or
special-case a route to make either gate pass. Register the route, or record an
allowlist entry with a reason.

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
| Genomics | `services/api/src/routes/genomics.js`, `services/api/src/services/genomicDatabases.js`, `vcf.js`. **Reachable:** `/genomics/phenotype/search`, `/genomics/enrich`, `/genomics/association-evidence`, `/genomics/publication-concepts/search`. **404'd by the boundary:** `/genomics/vcf/*`, `/genomics/variant/*`, `/genomics/clinvar/*`. **Env-gated off:** `GET /genomics/gene/:symbol` (needs `GENOMICS_GENE_LOOKUP_ENABLED=true`). |
| Shared client | `packages/shared/src/client.ts` |
| Stripe webhooks | `services/api/src/routes/billing.js` |
| Rate-limit store | `services/api/src/config/rateLimitStore.js` — optional `REDIS_URL` (ioredis) backs it; in-memory otherwise |
| Error monitoring | **None active.** `services/api/src/config/sentry.js` and `apps/web/lib/sentry.js` are deliberate no-op stubs (`initSentry()` returns `false`, `captureException()` is empty); neither imports `@sentry/*`, and `SENTRY_DSN` / `VITE_SENTRY_DSN` are read nowhere — setting them does nothing. `errorReporter` no longer exists. The only error path is `routes/clientError.js`, which accepts two enum values, logs them, and returns 204 without leaving the process. Verified 2026-08-19 at 3b492e5; regression-locked by `apps/web/lib/__tests__/clinicalPublishingBoundary.test.js:352-359`. |
| Operator alerting | `services/api/src/services/operatorAlert.js` — structured `[operator-alert]` stderr record always, plus email to `ADMIN_EMAILS` via `services/email.js` (Resend). Never throws, carries no identifying data. Emitted on a failed account-deletion ledger write; reported by `/readyz` as `operatorAlert`. **Alerts must not be routed to the no-op Sentry stubs above.** |

## Nightly self-test sweep (agents v1)

`scripts/agents/nightly-sweep.mjs` — GrantFlow-style self-testing/self-correcting loop, right-sized for this repo. Runs the REAL gates (`pnpm lint`, `pnpm typecheck`, `pnpm test`), then starts API+web dev servers (or reuses running ones) and runs the Playwright journey set (`apps/web/tests/e2e`, `PLAYWRIGHT_BASE_URL=http://localhost:5173`) — including the EVA regression journeys in `login-journeys.spec.js`: login loads console-clean with zero failed requests, and registration is reachable from /Login via EVA's verbatim locator.

- **Auto-fix lane (safe classes only):** if lint fails AND the tree was clean at sweep start, runs `eslint --fix`, re-runs the FULL gate (incl. e2e), and only then commits — on an `agents/autofix-*` branch (pushed for review unless `--no-push`), never on the current branch/main. Re-gate failure → fix reverted, finding reported. Dirty tree → auto-fix skipped entirely.
- **Findings report (Anya-style):** `reports/agents/nightly-<date>.md` + `latest.json` (health score 0–100 weighted lint 15 / typecheck 25 / unit 30 / e2e 30, needs-attention tails). Directory is gitignored (runtime output).
- **Schedule:** Windows scheduled task "GeneMap Nightly Sweep", daily 03:00, runs `scripts/agents/nightly-sweep.cmd` (logs to `reports/agents/last-run.log`). Manage with `schtasks /Query|/Run|/Delete /TN "GeneMap Nightly Sweep"`.
- **Local DB:** the local API's `services/api/.env` points `DATABASE_URL` at the shared `eva-postgres` Docker container (`postgresql://eva:eva@localhost:5433/genemap_eva`) — NOT the native :5432 Postgres (its credentials don't match; that mismatch silently 500'd every local register/login until 2026-08-02).
- Flags: `--no-push` (autofix branch stays local), `--no-servers` (never spawn servers), `--skip-e2e`.
- Trap: probe dev servers via host `localhost`, not `127.0.0.1` — Vite binds only `::1` on this box.

## Mobile OTA updates (Android + iOS)

The installed app can pull the latest production web bundle without a store
release, and tells the user when one is available.

- **Publish:** `scripts/build-mobile-bundle.mjs` zips `apps/web/dist` to
  `dist/mobile/bundle-<version>.zip` and writes `dist/mobile/latest.json`
  (`version`, absolute `url`, **`sha256`**, `minNativeVersion`, `notes`,
  `builtAt`). It is chained onto the DEPLOY build only — `vercel.json`'s
  `buildCommand` and `pnpm build:web:deploy` — never onto
  `pnpm --filter @genemap/web build`, because the native builds run that before
  `cap sync` and CI (`ci.yml` android-build-smoke) rejects `assets/public/mobile/`
  or any `.zip` inside the APK. Merge to main -> Vercel builds main -> feed live at
  `https://genemap-discovery.vercel.app/mobile/latest.json`.
- **Consume:** `apps/web/lib/mobileUpdater.js` (pure, unit-tested) +
  `components/settings/MobileUpdateCard.jsx` (Account Settings) +
  `components/MobileUpdatePrompt.jsx` (in-app banner).
- **Integrity, fail CLOSED:** a manifest without a valid 64-hex `sha256` is
  rejected before any download; the checksum is passed to
  `@capgo/capacitor-updater`'s `download()` (which hashes the file and throws on
  mismatch) AND re-compared against `BundleInfo.checksum` afterwards. A mismatch
  deletes the bundle and refuses to apply it. Nothing calls `set()` on unverified
  bytes. This is what sermonsmith PR #96 removed an updater for; do not weaken it.
- **Notify:** `lib/mobileUpdateNotifier.js` checks on launch and on
  resume (`visibilitychange`, so no extra plugin), raises ONE
  `@capacitor/local-notifications` notice per published version, and dispatches
  `genemap:mobile-update-available` for the in-app banner. A denied notification
  permission is silent and never blocks the in-app path.
- **Native floor:** `minNativeVersion` (ANDROID_VERSION_NAME lineage, default
  `1.0`) — bump it via `MOBILE_MIN_NATIVE_VERSION` in the same commit as anything
  needing a new native build. Below the floor the UI says "a new app version is
  required" and links to signed releases instead of offering a web update.
- **Traps:** the Capacitor plugin handle is a Proxy that answers `then`, so
  returning it bare from an `async` function makes the runtime call
  `CapacitorUpdater.then()` (UNIMPLEMENTED) — `lib/capacitorUpdaterPlugin.js`
  returns it wrapped, and is also the seam tests mock. The Capacitor CLI on
  Windows writes BACKSLASH paths into `ios/App/CapApp-SPM/Package.swift`; they
  must be forward slashes or the macOS build breaks. iOS cannot be built or
  signed from Windows — that needs a Mac plus an Apple Developer account.

## Gotchas

- Base44 Deno functions have been removed from the active tree.
- `pnpm dev` starts API and web together; desktop is separate.
- API baseURL fallback in `client.ts`: `VITE_API_URL` -> localhost API in local browser -> same-origin proxy.
- Medical data encryption requires a 64-character hex `MEDICAL_DATA_ENCRYPTION_KEY` in production.
- Stripe price IDs must come from server env; do not trust client-supplied price IDs.
- `genemap-api`'s Railway service had no GitHub source connected until 2026-07-05 (`source.repo` was null) — every "deploy" was actually a manual `railway up` after merging to main. Reconnected via Railway's GraphQL `serviceConnect` mutation (repo `buckeye7066/genemap-discovery`, branch `main`) and confirmed a real auto-triggered deployment fired within seconds of a merge. Should now auto-deploy on merge like a normal Railway+GitHub setup, but verify with `railway status --json` (`source.repo`) or deployment timestamps after any high-stakes merge, since this had silently regressed before.
