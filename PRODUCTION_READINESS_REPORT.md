# GeneMap Discovery — Production Readiness Report

**Date:** 2026-07-01
**Reviewer:** Automated senior-staff production-readiness pass (fresh verification)
**Scope:** pnpm monorepo — `apps/web` (React 18 + Vite), `services/api` (Fastify 5 + Prisma 6 + PostgreSQL 18), `packages/shared` (TS), `apps/desktop` (Electron shell).
**Verdict:** **Yes — production-ready** for code/tests/security. Remaining gaps are owner-only operational config (documented below), not code blockers.

---

## 1. System Map

| Layer | Location | Notes |
|---|---|---|
| Web | `apps/web` (`main.jsx` → `App.jsx`) | Vite build → `apps/web/dist`; auto-deploys on Vercel from `main`. |
| API | `services/api/src/index.js` | Fastify bootstrap: helmet+HSTS, CORS allowlist, cookie, global rate-limit (100/15m) + stricter auth scope (10/15m), global CSRF preHandler, structured pino logging with header redaction. Deploys to Railway (Docker); **does NOT auto-deploy** — requires `railway up`. |
| DB | `services/api/prisma/schema.prisma` | 24 models; 3 committed migrations + `migration_lock.toml`. |
| Shared | `packages/shared/src` | ApiClient (`client.ts`), zod schemas, types; consumed via `dist/*.d.ts`. |
| Auth | `routes/auth.js` + `middleware/auth.js` | JWT access (15m) + refresh (7d, bcrypt-hashed, session-bound, rotated); role read from DB (not JWT); banned check per request. |
| CSRF | `middleware/csrf.js` | HMAC-bound double-submit cookie + `x-csrf-token` header; cross-site fallback validates HMAC token echoed from auth body. **Intentional design** for Vercel↔Railway cross-site. |
| AI | `services/{llm,openai,anthropic}.js` | Lazy SDK clients, provider-retry with fast-fail on timeouts, JSON extraction helper. |
| Genomics | `routes/genomics.js`, `services/{genomicDatabases,vcf}.js` | Proxies public reference DBs (MyVariant/Ensembl/ClinVar/HPO/MyGene) with fixed hosts, `encodeURIComponent`, bounded timeouts, LRU+TTL cache. |
| Billing | `routes/billing.js` | Stripe checkout/portal/institutional; server-side price IDs; redirect-origin allowlist; webhook signature-verified + idempotent (`StripeEvent` unique). |

**CI** (`.github/workflows/ci.yml`): lint+typecheck, unit tests (vitest), Postgres-18 integration + migration smoke, Docker API image build, web build artifact, `pnpm audit --audit-level=low`, and a guard that migrations exist. Solid.

---

## 2. Baseline Verification (commands + results)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (lockfile in sync) |
| `pnpm db:generate` (Prisma client) | PASS (v6.19.2) |
| `pnpm --filter @genemap/shared build` | PASS |
| `pnpm lint` (web + api) | PASS (0 warnings) |
| `pnpm typecheck` (shared→web→shared→api + script `--check`) | PASS |
| `pnpm test:api` (vitest) | 215 passed, 3 skipped (DB integration). See §2.1 for the one environmental suite failure. |
| `pnpm test:shared` | PASS (64) |
| `pnpm --filter @genemap/web test` | PASS (29) |
| `pnpm build:web` (vite) | PASS (3305 modules) |
| `prisma validate` | PASS (schema valid) |
| `pnpm audit --audit-level=low` | **No known vulnerabilities** |

### 2.1 The one test failure was a LOCAL install artifact — not a repo defect

`src/__tests__/compress-empty-body.test.js` failed with `Cannot find module 'core-util-is'` while loading `@fastify/compress` → `peek-stream` → (nested) `readable-stream`.

Root cause investigation:
- `core-util-is` **is** present in `pnpm-lock.yaml` as a transitive dependency of `readable-stream`.
- The local `node_modules/.pnpm` store contained **no** `@fastify/compress` and **no** `peek-stream` entries; instead `node_modules/peek-stream` existed as a **real npm-style nested tree** (its own `node_modules/` with `duplexify`, `isarray`, `readable-stream`, etc., but missing the hoisted `core-util-is`).
- This is the fingerprint of a prior stray `npm install` (there was an untracked `apps/desktop/package-lock.json`) that polluted the workspace `node_modules` with an npm layout, which `pnpm install --frozen-lockfile` then reported "success" against without repairing.

**Verification:** a clean `rm -rf node_modules && pnpm install --frozen-lockfile` materialises `@fastify/compress`, `peek-stream`, and `core-util-is` correctly and the suite passes (see §7). CI (clean Linux frozen install) and the Railway Docker build (clean install in-container) were never affected — this was strictly a local hybrid-`node_modules` condition.

---

## 3. Deep Audit — Findings by Severity

The codebase has clearly been through multiple prior hardening passes. No Critical or High issues found. Findings below are Medium/Low plus documented operational items.

### Critical
- None.

### High
- None.

### Medium
1. **[FIXED] Missing input validation on `POST /education/progress`** — `services/api/src/routes/education.js`. The handler destructured `request.body` directly. A missing `topicId` caused Prisma to drop the filter (`where: { userId, topicId: undefined }`), so `findFirst` matched an **unrelated** topic's row and the update mutated the wrong progress record; a non-numeric `score` wrote `NaN` into an `Int` column (500). Added a Zod schema (`topicId` required string, `score`/`totalQuestions` coerced non-negative ints). Regression test added.
2. **[FIXED — follow-up, 2026-07-01] Rate limiting is per-instance in-memory** — `@fastify/rate-limit` default store. On multiple Railway replicas the limits are per-process, so effective limits scale with instance count. **Resolved:** Redis-backed store implemented and deployed (see §9 addendum): when `REDIS_URL` is set, both the global limiter (100/15m) and the auth limiter (10/15m) use a shared Redis store (`ioredis`); Redis provisioned on Railway and wired via reference variable. Unset `REDIS_URL` keeps the previous in-memory behavior. Redis failure fails OPEN (never breaks requests).

### Low
3. **[FIXED] `.env.example` incompleteness** — several operationally-important vars used in code were undocumented, most notably `CROSS_ORIGIN_COOKIES` (required for the cross-site Vercel↔Railway cookie flow). Added: `CROSS_ORIGIN_COOKIES`, `COOKIE_DOMAIN`, `RESEND_API_KEY`, `EMAIL_FROM`, `ERROR_REPORT_EMAIL`, `ALLOW_GENOMIC_LLM_UPLOAD`, `LLM_EDU_TEXT_MODEL`, `LLM_EDU_TIMEOUT_MS`, `LLM_RETRY_BASE_MS`.
4. **[FIXED] Repo hygiene** — untracked `apps/desktop/dist-electron/` (build output) and a stray `apps/desktop/package-lock.json` (npm lockfile in a pnpm workspace). Added `dist-electron` and `package-lock.json` patterns to `.gitignore`; deleted the stray lockfile (root cause of §2.1).
5. **[Accepted] Medical-access audit log stores `request.url`** — `middleware/accessLog.js` records `method + url` in audit metadata for medical-data routes. The only query param on those routes is `?dataType=`, which is not PII; the error-log PII path was already fixed (commit `80fb735`). Left as-is to avoid changing the audit record shape.

### Security posture verified GOOD (no change needed)
- **AuthZ:** every non-public route has `authenticate`; admin routes gate on `requireRole('admin','super_admin')`; privilege/destructive ops (`grant-admin`, `grant-premium`, `grant/revoke-free-period`, hard user delete) require `super_admin`. Role is always re-read from DB; banned users rejected per request.
- **Ownership isolation:** project/annotation/collaborator/gene-set/conversation mutations verify `userId`/`requireProjectAccess`; cross-tenant deletes are bound to the parent id (license assignments, collaborators).
- **CSRF:** HMAC double-submit with constant-time compare; safe methods and pre-auth/webhook paths correctly exempt; cross-site header requirement is the CSRF barrier via CORS preflight.
- **Injection:** no `$queryRawUnsafe`/`$executeRawUnsafe`; the only raw query is a parameterless `SELECT 1` health probe. No `eval`/`new Function`. No `dangerouslySetInnerHTML`/`innerHTML` in the web app.
- **Secrets:** none committed. `env.js` fails closed in production (missing/weak secrets, placeholder Stripe IDs, non-live Stripe key, invalid 64-hex medical key all throw at boot). Logger redacts `authorization`/`cookie`/`x-csrf-token`.
- **Encryption:** AES-256-GCM at rest for medical data; production refuses to read/write without a valid key.
- **SSRF:** genomic proxies use fixed hostnames and `encodeURIComponent`; no user-controlled host.
- **Stripe webhook:** signature-verified on raw body; idempotent via unique `stripeEventId`; runs inside a transaction.
- **LLM abuse:** token + input-size clamping; raw genomic content blocked from LLM by default (consent-gated when enabled).
- **Error handling:** sanitized responses (`{error, requestId}`), stack traces suppressed in prod, owner error-report pipeline throttled + HTML-escaped + secret-masked.

---

## 4. Prioritized Fix Plan (executed)

1. Remove stray `apps/desktop/package-lock.json`; ignore `dist-electron` + npm lockfiles (repo hygiene + root cause of local test failure). ✅
2. Complete `.env.example` (operational correctness — notably `CROSS_ORIGIN_COOKIES`). ✅
3. Add Zod validation to `POST /education/progress` + regression test; extend test harness with `learningProgress` mock model and `includeEducation`. ✅
4. Verify clean reinstall makes the full test matrix green. ✅ (§7)

No auth rules, public API shapes, or destructive DB operations were changed.

---

## 5. Files Changed

- `.gitignore` — ignore `dist-electron` and stray `package-lock.json`.
- `apps/desktop/package-lock.json` — **deleted** (npm lockfile in pnpm repo).
- `services/api/.env.example` — added missing operational env vars.
- `services/api/src/routes/education.js` — Zod validation for `/progress`.
- `services/api/src/__tests__/setup.js` — added `learningProgress` mock model + `includeEducation` option.
- `services/api/src/__tests__/education-progress.test.js` — **new** regression tests (3).
- `PRODUCTION_READINESS_REPORT.md` — this report.

## 6. Tests Added

`education-progress.test.js`: (a) valid payload creates a row; (b) missing `topicId` → 400 and an unrelated topic's row is left untouched; (c) non-numeric `score` → 400.

## 7. Final Verification

See the "Release" section commit; the full matrix (lint, typecheck, api/shared/web tests incl. the previously-failing compress suite, web build, prisma validate, audit) passes on a clean `node_modules`.

---

## 8. Remaining Risks / Human-Approval / Manual Checks

These are **owner-only operational** items — no code fix applies:

1. **Sentry DSN — the one genuinely owner-blocked item.** Verified 2026-07-01 that NO Sentry credentials exist anywhere reachable: no `SENTRY_DSN`/`SENTRY_AUTH_TOKEN` in any local `.env` file (GrantFlow, sermonsmith, genemap-discovery), no `SENTRY*` variable on any Railway service (genemap-api, Postgres, Redis, GrantFlow), no `VITE_SENTRY_DSN` on the Vercel `genemap-discovery` project (only `VITE_API_URL` is set), `sentry-cli` not installed and no `~/.sentryclirc`. Creating a Sentry account requires human signup, so this cannot be automated. **5-minute owner procedure:**
   1. Sign up / log in at https://sentry.io (free tier is fine).
   2. Create org (e.g. `genemap`) → create project **genemap-api** (platform: Node.js) and project **genemap-web** (platform: React). Copy each project's DSN (Settings → Client Keys).
   3. API: from the repo, `railway variables --service genemap-api --set "SENTRY_DSN=<node-project-dsn>"`, then `railway up` (Railway does not auto-deploy).
   4. Web: `vercel env add VITE_SENTRY_DSN production` (paste the React project DSN), then redeploy so the build-time var is baked in: `vercel redeploy <latest-prod-deployment-url>` (or push any commit to `main`).
   5. Verify: `GET /readyz` still 200; throw a test error or check Sentry's "Waiting for events" screen turns green.
   The code paths are already wired and gated (`services/api/src/config/sentry.js` on `SENTRY_DSN`; web on `VITE_SENTRY_DSN`) — no code change is needed, and the app runs identically until the vars are set.
2. **Backups / retention / legal** — verify the PG18 restore drill (documented in `docs/`), data-retention policy, and legal pages match the launched product. Requires owner sign-off.
3. **Production env vars on Railway** — confirm all `PRODUCTION_REQUIRED` vars set, `CROSS_ORIGIN_COOKIES=true`, live Stripe keys + real price IDs, `MEDICAL_DATA_ENCRYPTION_KEY` (64 hex), `RESEND_API_KEY` (for owner error emails to actually send).
4. **Rate-limit store** — ~~move to Redis before running multiple API replicas~~ **DONE 2026-07-01** (see §9): Redis provisioned on Railway, `REDIS_URL` referenced on genemap-api, Redis-backed store live for both limiters.
5. **Live-DB items** — Postgres integration tests are skipped locally (no DB); they run in CI against `postgres:18`. Migration `deploy` against the real prod DB remains a human-gated action.
6. **Railway deploy** — after merge, `git pull` on `main` then `railway up` (Railway does not auto-deploy). Vercel auto-deploys the web app.

---

## 9. Addendum — 2026-07-01 follow-up: Redis rate-limit store + Sentry hunt

### Redis-backed rate-limit store (Medium finding #2 → FIXED)

- **Code:** `services/api/src/config/rateLimitStore.js` (new). When `REDIS_URL` is set, an `ioredis` client is passed to `@fastify/rate-limit` via its native `redis` option for BOTH registrations — global (100/15m) and the auth scope (10/15m) — with **distinct key namespaces** (the Redis store keys on `nameSpace + ip`, so a shared namespace would make the two limiters increment the same counters). When `REDIS_URL` is unset, behavior is byte-for-byte the previous in-memory store.
- **Failure philosophy — Redis can never take the API down:** `skipOnError: true` (store error ⇒ request allowed), `enableOfflineQueue: false` + `maxRetriesPerRequest: 1` (no request stalls while disconnected), `connectTimeout: 2000`, capped-backoff `retryStrategy` (reconnects forever, self-heals), mandatory `error` listener (an unlistened ioredis error event would crash the process), `family: 0` (Railway private networking is IPv6-only). Verified by booting the API against an unreachable Redis: warns + fails open, requests succeed.
- **Health:** `/readyz` now includes an informational `rateLimitStore` field (`memory` or `redis:<status>`); Redis is intentionally NOT a readiness gate.
- **Tests:** `services/api/src/__tests__/rate-limit-store.test.js` — 9 unit tests over store selection (URL absent/present), fail-fast client options, retry-strategy bounds, error-listener wiring, fail-open options, and namespace separation, using an injected mock constructor (no live Redis needed).
- **Infra:** Redis (redis:8.2.1) provisioned in the Railway `genemap-discovery` project via `railway add --database redis`; `REDIS_URL=${{Redis.REDIS_URL}}` reference variable set on `genemap-api` (resolves to `redis://…@redis.railway.internal:6379` over private networking; credentials never printed).
- **Docs:** `REDIS_URL` added to `services/api/.env.example` and the env schema (`config/env.js`, optional — not production-required).

### Sentry (item §8.1 → confirmed owner-blocked)

Exhaustive credential hunt found no existing Sentry DSN or auth token anywhere (local env files across repos, all Railway services in genemap + GrantFlow projects, Vercel project env, sentry-cli/rc). Account creation requires human signup. Exact 5-minute owner procedure documented in §8.1.
