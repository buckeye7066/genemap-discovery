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

## 6b. Follow-up — durable no-cloud-genomic chokepoint (2026-07-18)

A second review (Codex) confirmed the initial route-level guard was **incomplete**: it covered only `/education/explain` + `/education/chat`, while **four more cloud-AI surfaces still forwarded raw genomic content**, including a bypass *inside* a guarded path and an *unauthenticated* one. The durable fix routes **every** cloud-provider call through a single guarded chokepoint so no call site can bypass it.

**Chokepoint:** `services/api/src/services/llm.js` — `assertProviderPayloadAllowed()` runs at the top of **all four** provider functions (`generateExplanation`, `generateChatResponse`, `generateImage`, `generateQuiz`). It extracts the exact provider-visible text via `extractProviderText()` (recurses into array-form `content` parts) and refuses raw genomic text unless the caller passes the consent-backed `allowGenomic:true` marker. Every provider call in the app flows through these four functions (verified by grep — the only importers are `routes/llm.js`, `routes/education.js`, and `services/errorReporter.js`; no embeddings/streaming/other provider entry points exist). A new route now **physically cannot** reach OpenAI/Anthropic without passing the chokepoint.

Specific bypasses fixed:

| # | Sev | Surface | Bug | Fix | Test (provider NOT called on VCF) |
|---|---|---|---|---|---|
| B1 | CRITICAL | `/llm/chat` (`routes/llm.js`) | Guard size-checked only string content, then `join()`-ed `message.content`; array content `[{type:'text',text:'<VCF>'}]` made the guard see `"[object Object]"` while the raw array was still forwarded | Reject any non-string message content (clean 400); chokepoint also extracts array text | `genomicGuard.test.js` array-form case; `llm-chokepoint.test.js` |
| B2 | CRITICAL | `/education/quiz` (`education.js`) | User-controlled `topic` (≤500 chars) embedded in the quiz prompt with no guard | `assertNoRawGenomicLLM(prisma, userId, topic)` before building the prompt | `genomicGuard.test.js` `/education/quiz` |
| B3 | CRITICAL | `/report-client-error` → `errorReporter.analyzeError` | **Unauthenticated**; client-supplied `message`/`stack` sent to `generateExplanation` with no guard/consent | Pre-check `looksLikeRawGenomicContent(message+stack)`; if genomic, **skip cloud** and use the deterministic heuristic (no consent required on an unauth path — just refuse to forward) | `errorReporter-genomic.test.js` |
| B4 | HIGH | `/llm/image` + `/education/image` | Image prompts/`topic` sent to `generateImage` with only a string check (`MAX_PROMPT_CHARS` ≈ 200k) | Guard both before `generateImage` | `genomicGuard.test.js` `/llm/image` + `/education/image` |

Consent path preserved: `assertNoRawGenomicLLM` now returns a boolean (`true` = genomic-and-consented) that routes thread into `allowGenomic` so a legitimately consented genomic upload still works end-to-end; the chokepoint blocks everything else.

**Every cloud-AI surface now enforces the guard via the chokepoint** (defense in depth = route-level early 400 + chokepoint backstop):
- `/llm/invoke` — route guard + chokepoint (`generateExplanation`)
- `/llm/chat` — non-string-content reject + route guard + chokepoint (`generateChatResponse`)
- `/llm/image` — route guard + chokepoint (`generateImage`)
- `/education/explain` — route guard + chokepoint (`generateExplanation`)
- `/education/quiz` — route guard + chokepoint (`generateQuiz`)
- `/education/image` — route guard + chokepoint (`generateImage`)
- `/education/chat` — route guard + chokepoint (`generateChatResponse`)
- `/report-client-error` (unauth) — heuristic-skip pre-check + chokepoint (`generateExplanation`)

**Follow-up verification:** `pnpm install --frozen-lockfile` clean; API **327 passed, 3 skipped** (+18: `llm-chokepoint` 12, `errorReporter-genomic` 2, plus 4 new route cases in `genomicGuard`); shared 69; web 55; lint + typecheck (self-test) clean; `build:web` clean; `git diff --check` clean. Tests set `OPENAI_API_KEY=''` locally so a guard regression can never make a real paid call.

## 6c. Follow-up — three more genomic-leak vectors closed (2026-07-18)

A third review (Codex) found the chokepoint still had **three** ways raw genomic data could reach the cloud (one CRITICAL). All fixed with a regression test each.

- **C1 [CRITICAL] — tool/function-argument smuggling (`/llm/chat` + `extractProviderText`).** The route checked only that `content` was a string and kept the original message objects; `extractProviderText` returned only `content` and never inspected sibling fields the model still reads (`tool_calls[].function.arguments`, `function_call.arguments`). A client could send harmless `content` + a VCF in tool arguments and pass both guards. **Fix:** (a) `routes/llm.js` now rejects any client-supplied `tool_calls`/`function_call`/`tool_call_id` and whitelists outbound turns to exactly `{role, content}`; (b) `extractProviderText` (`services/llm.js`) now **recursively** collects every provider-visible string (skipping only structural `role`/`type` keys), so tool/function argument text is inspected by the chokepoint. **Tests:** `extractProviderText` collects `tool_calls`/`function_call` arguments; `generateChatResponse` rejects a VCF hidden in `tool_calls[].function.arguments` with clean content; route test `/llm/chat` clean content + VCF in tool args → 400, provider not called.

- **C2 [HIGH] — revoked consent ignored (`genomicGuard.js`).** The consent lookup filtered `granted:true` *inside* the query before ordering, so an older grant kept authorizing after the user recorded a newer `granted:false` revocation. **Fix:** fetch the LATEST record for `(userId, consentType, version)` **regardless of `granted`**, then require `latest.granted === true`; also fail closed when `userId` is missing. **Tests:** newer `granted:false` after older `granted:true` → blocked (and asserts the query carries no `granted` filter); missing `userId` → blocked without querying.

- **C3 [HIGH] — detector failed open on encoded/small payloads (`genomicGuard.js`).** The old detector only caught the canonical `#CHROM` header or ≥3 variant-shaped lines, so base64/gzip VCFs, JSON/CSV variant rows, and 1–2 variants evaded all four guarded entry points. **Fix — fail closed on:** a single bare VCF/variant data row (5-col or ≥8-col with numeric QUAL), a pasted compact identifier (`1-12345-A-G`, `chr1:12345:A>G`) or bare HGVS (`c.20A>T`) on its own line, JSON variant records (co-occurring ref+alt+pos/chrom keys), CSV/TSV with variant headers, and **base64/gzip/data-URI** blobs (decoded — gunzipped if needed — and re-checked, bounded recursion). It deliberately does NOT flag a single incidental coordinate/HGVS *mention inside a sentence*, so genetics education still works; the module docstring is honest that a text heuristic can't catch everything and that the load-bearing guarantee is architectural (raw VCF parsed locally, never sent to cloud by default). **Tests:** single bare variant row, compact id, bare HGVS, JSON variant array, CSV variant header, base64-encoded VCF, gzip+base64 VCF all → caught; single HGVS/coordinate inside a sentence → not caught.

**Follow-up verification:** `pnpm install --frozen-lockfile` clean; API **341 passed, 3 skipped**; shared 69; web 55; lint + typecheck (self-test) clean; `build:web` clean; `git diff --check` clean.

## 7. External blockers

- `postgres-integration.test.js` (3 tests) requires a live PostgreSQL and is skipped in this environment; run in CI (`api-integration-postgres` job, `postgres:18`) for full coverage.
- A real production `pnpm launch:verify` (non-self-test) still requires production URLs + secrets; unchanged and out of scope for local verification.
- Branch closure recommendations require a human to confirm against the originating PRs before deletion.
