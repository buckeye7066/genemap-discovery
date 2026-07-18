# GeneMap Discovery — Portfolio Hardening Audit

Branch: `claude/portfolio-hardening-2026-07-18`
Date: 2026-07-18
Scope: portfolio spec §5.2, reproduced against the actual checkout. Local-only; nothing pushed/merged/deployed. No real genomic/phenotype data used (synthetic fixtures only); no live scientific-DB or cloud-AI calls in verification.

---

## 1. Contract matrix (binding invariants — PRESERVE items)

| # | Invariant (from README / CLAUDE.md / code) | Status in checkout | Evidence | Locked by test |
|---|---|---|---|---|
| C1 | Raw VCF/genomic text stays LOCAL by default; never sent to cloud AI without opt-in + consent | **Held on `/llm/*`; GAP on `/education/*`** (fixed) | `services/api/src/routes/llm.js` guard; `education.js` `/explain` `context` + `/chat` were unguarded | `genomicGuard.test.js` (14 tests) |
| C2 | No diagnostic/treatment claims; education-not-medicine | Held | `scientificHonesty.js:17-25` directive #4; `vcf.js:236-240` `clinicalConfirmationRequired`; disclaimers on every LLM route | `scientificHonesty.test.js`, `MedicalDisclaimer.test.jsx` |
| C3 | Source/provenance links + retrieval date + confidence/limitations on results | Held | `vcf.js:176-241` `source()` returns name+url+`retrievedAt`, ClinVar `reviewStatus`, `evidenceSummary`, `questionsForClinician`; gene records carry `genomeBuild:'GRCh38'` + `source` + `verified` (`genomicDatabases.js:297-311`) | `vcf.test.js`, `SourceList.test.jsx`, `geneReferenceLinks.test.js` |
| C4 | Missing-source states fail soft (unverified AI values dropped, never fabricated) | Held | `genomicDatabases.js:361-374` (`enrichGenes` → null), `387-412` (`validateHpoTerms` → `verified:false`) | `genomicEnrich.test.js` |
| C5 | Sensitive data sent to cloud AI only with explicit consent + minimisation | Held (now uniformly) | `genomicGuard.js:assertNoRawGenomicLLM` — opt-in env + granted `consentRecord`, audit logs `contentLength` only | `genomicGuard.test.js` |

**C1 was the one real invariant gap.** The no-cloud-genomic guard lived only in `routes/llm.js`; `routes/education.js` `/explain` accepts a free-text `context` field that is prepended to the cloud-LLM prompt (`education.js:209-211`, comment explicitly notes it "legitimately prepends" genomic context), and `/chat` messages likewise reach the LLM — neither ran the guard. A user could paste a raw VCF into `context` and it would be forwarded to OpenAI/Anthropic. Fixed by extracting the guard to a shared module and enforcing it on both education surfaces.

---

## 2. Baseline (RED-at-baseline)

Installed with corepack **pnpm 9.15.9** (`--frozen-lockfile` — clean). Pre-change:

- `pnpm --filter @genemap/api test` → **309 passed, 3 skipped** (skipped = `postgres-integration.test.js`, needs a live Postgres; expected in a no-DB env — not a red).
- `pnpm --filter @genemap/shared test` → 69 passed.
- `pnpm --filter @genemap/web test` → 53 passed (pre-`bundleConfig`, 11 files).
- Targeted pre-change re-run of the 6 API files I would touch (`llm`, `vcf`, `launch-readiness`, `scientificHonesty`, `genomicEnrich`, `llm-retry`) → 49 passed.
- `pnpm lint` → clean. `pnpm typecheck` → clean.

No red at baseline. All failures observed during work were in the newly-added tests and were resolved before commit.

---

## 3. Findings, severity, fixes

### F1 — [HIGH] No-cloud-genomic guard not enforced on the education LLM surface  *(spec item 1 / 7, Priority 1)*
- **Evidence:** `routes/education.js:206` (`/explain` used `context` with no guard), `:351` (`/chat`); guard existed only in `routes/llm.js`.
- **Fix:** Extracted `looksLikeRawGenomicContent` + `assertNoRawGenomicLLM` into `services/api/src/services/genomicGuard.js` (single source of truth, provider-neutral, fail-closed, minimised audit). `routes/llm.js` now imports it (inline copy deleted). `routes/education.js` calls it on the `/explain` topic+context (`education.js:209`) and `/chat` messages (`education.js:355`).
- **Tests:** `services/api/src/__tests__/genomicGuard.test.js` — detector unit tests, enforcement unit tests (default-deny / opt-in-no-consent / opt-in+consent+minimised-audit), and route integration proving `/llm/invoke`, `/llm/chat`, `/education/explain` (via `context`), `/education/chat` all reject a pasted VCF with 400 **and never call the provider**, while an ordinary topic still returns 200.

### F2 — [MED] Empty `vendor-3d` build chunk + unused `three` dependency  *(spec item 3)*
- **Evidence:** `apps/web/vite.config.js:52` declared `'vendor-3d': ['three']`, but no source file imports `three` (grep over `apps/web`, `packages`, `services` for `from 'three'` / `require('three')` = 0 hits; the only "three" occurrences are the English word in `BannedUsers.jsx:375` and the config line). `three@^0.185.1` was a dependency (`apps/web/package.json`). Rollup emits an empty `vendor-3d` chunk and ships a large unused lib in the tree.
- **Fix:** Removed the `vendor-3d` manualChunks entry (`vite.config.js`) and the `three` dependency (`apps/web/package.json`); regenerated `pnpm-lock.yaml` (`three` removed, `--frozen-lockfile` re-verified). Route-level lazy loading verified: the SPA does not code-split via `React.lazy` (no lazy routes present); chunking is dependency-based `manualChunks` only — removing the dead chunk is the correct action, no lazy-load regression. Web build now produces no `vendor-3d` chunk and no empty-chunk warning.
- **Tests:** `apps/web/lib/__tests__/bundleConfig.test.js` — asserts `vite.config.js` has no `vendor-3d`/`'three'` and `package.json` has no `three` dep.

### F3 — [MED] Production launch verification only `node --check` in the gate  *(spec item 5)*
- **Evidence:** `scripts/verify-production-launch.mjs` is already a full environment-aware verifier (loads `env.js`, validates Stripe/env/evidence/HTTP) and is unit-tested (`launch-readiness.test.js`). But the **release gate** only syntax-checked it: `package.json` `typecheck` ended with `node --check scripts/verify-production-launch.mjs`, and `release:check` never invoked it. `node --check` never imports `env.js` or runs a single validation branch, so a runtime regression would pass the gate.
- **Fix:** Added a `--self-test` mode (`runSelfTest`, exported) that runs the env + evidence validators against a synthetic hardened fixture (no network, no real secrets) and asserts fail-closed behaviour (a non-live Stripe key is still rejected). Wired `launch:verify:selftest` into **both** `typecheck` (replacing `node --check`) and `release:check`.
- **Tests:** new case in `launch-readiness.test.js` (`runSelfTest(NOW)` → no problems); gate execution confirmed (`pnpm typecheck` runs and passes the self-test).

### F4 — [LOW] Stale docs: Postgres major + deployment state  *(spec item 4)*
- **Evidence:** `README.md:46` said "PostgreSQL 16+" and the docker command used `postgres:16`, but CLAUDE.md, CI (`ci.yml` `postgres:18`) and prod run **PostgreSQL 18**. README "Migration Status → In Progress: Production deployment" contradicted CLAUDE.md (API live on Railway, auto-deploys on merge).
- **Fix:** `README.md` — Postgres 18 (prereqs + docker command), pnpm-9-via-corepack note, deployment marked live (Railway API auto-deploy on `main` + Vercel web), and explicit local/desktop/web/API responsibilities. Historical `docs/audits/**` snapshots left untouched (they are point-in-time archives).

### F5 — [LOW/hardening] Shared `fetchJSON` could retry a non-idempotent request  *(spec item 6)*
- **Evidence:** `services/api/src/services/genomicDatabases.js` `fetchJSON` retried on transient status/network for **any** method. Today the only non-GET caller is MyGene.info `POST /v3/query` (a batch **read**), so no write is retried in practice — but the helper is a latent "retry a write" risk for any future caller.
- **Fix:** Added `isRetryableRequest(method, options)` (exported) — retries only GET/HEAD by default; a known-safe non-GET read may opt in with `idempotent:true`. `fetchJSON` sets `attempts = retryable ? 3 : 1`. Marked the MyGene batch read `idempotent:true` to preserve its resilience. Jitter + `AbortSignal.timeout(15s)` cancellation already present.
- **Tests:** `services/api/src/__tests__/fetch-retry-idempotency.test.js` — GET/HEAD retryable, all writes non-retryable, explicit opt-in honored, falsy opt-in ignored.

---

## 4. Items reproduced-as-different / not reproduced

- **Spec item 2 (pnpm MAJOR mismatch lockfile vs packageManager): NOT reproduced.** The toolchain is already internally consistent at **pnpm 9.15.9**: root `packageManager: pnpm@9.15.9`, `engines.pnpm >=9.0.0 <10`, `pnpm-lock.yaml` `lockfileVersion: '9.0'` (pnpm-9 format), `services/api/Dockerfile` `corepack prepare pnpm@9.15.9`, CI `pnpm/action-setup@v6` (reads `packageManager`). No sub-package declares a conflicting `packageManager`. **Node major is already pinned** (`engines.node >=24.0.0`; CI + Dockerfile on Node 24). I verified `pnpm install --frozen-lockfile` succeeds. No alignment change was required or made; documented the pnpm-9/corepack expectation in README for clarity.
- **Spec item 6 (transient-retry work in open PRs/branches): the retry work is already in `main`.** `withProviderRetry` (`services/llm.js`) and the DB-layer retry (`genomicDatabases.js`) already implement bounded transient retry with jitter, timeout-fails-fast, and connection-reset handling. My F5 fix adds the missing "idempotent-only" invariant. See §5 for branch triage.

---

## 5. Open-branch triage (item 6 — REPORT ONLY, nothing closed)

Ahead/merged vs `main`, then diff evidence:

- `fix/desktop-electron-builder`, `fix/genemap-discovery-audit-ux-repair`, `flexfactor/audit-genemap` — **already merged into `main`** (`git branch --merged`), ahead=0. Safe to delete (not done).
- `fix/keepalive-502`, `fix/sw-undefined-response`, `feat/cohort-vcf-annotation`, `fix/capacitor-cors`, `deps-prod-group-0702`, `fix/llm-prompt-limit-and-profile` — **stale / superseded.** `git diff main..<branch>` is dominated by *deletions* (e.g. `fix/keepalive-502`: +391/−3282 over 65 files; it *lacks* `scientificHonesty.js`, the current `llm.js` retry code, `genomicGuard`), i.e. the branch predates the current `main` and its intent has landed via later squash-merges (PRs #76–#91). In particular the **transient-retry / keepalive** work these branches represent is already in `main`. Recommend closing after a human diff, but **not closed here**.
- `fix/genemap-e2e-all-users` (2 files), `feat/free-week-giveaway`, `feat/error-email-alerts`, `feat/admin-grant-free-period`, `fix/admin-user-delete`, `fix/desktop-electron-builder-version`, `fix/platform-typecheck2`, `fix/prod-errors-...` — small/targeted; each shows net-deletion vs `main`, suggesting superseded, but confirm against the corresponding PR before closing.

No branch was closed, deleted, pushed, or merged.

---

## 6. Verification gate results (pre-commit)

- `pnpm install --frozen-lockfile` (pnpm 9.15.9) — clean after lockfile regen.
- `pnpm --filter @genemap/api test` — **309 passed, 3 skipped** (final, includes the new `genomicGuard.test.js` (14), `fetch-retry-idempotency.test.js` (4), and the added `launch-readiness` self-test case; postgres-integration's 3 tests skipped — no DB).
- `pnpm --filter @genemap/shared test` — 69 passed.
- `pnpm --filter @genemap/web test` — 55 passed (was 53; +2 `bundleConfig`).
- `pnpm lint` — clean. `pnpm typecheck` — clean (now executes the launch self-test in-gate). `pnpm build:web` — clean, no `vendor-3d`/empty-chunk warning.
- `git diff --check` — clean. No secrets or real genomic data added (fixtures are synthetic: `chr1 12345 rs1 A G`).

## 7. External blockers

- `postgres-integration.test.js` (3 tests) requires a live PostgreSQL and is skipped in this environment; run in CI (`api-integration-postgres` job, `postgres:18`) for full coverage.
- A real production `pnpm launch:verify` (non-self-test) still requires production URLs + secrets; unchanged and out of scope for local verification.
- Branch closure recommendations require a human to confirm against the originating PRs before deletion.
