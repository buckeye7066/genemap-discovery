# Axiom GeneMap Discovery - Production Readiness Report

**Program:** Axiom GeneMap Discovery  
**Executor:** ChatGPT  
**Working branch:** `chatgpt/production-ready/genemap-discovery`  
**Repo:** buckeye7066/genemap-discovery (private; default `main`)  
**Local path recorded by prior executor:** `C:\Users\firer\genemap-discovery` (not independently accessible from this session)  
**Deployed app:** https://genemap-discovery.vercel.app  
**API:** https://genemap-api-production.up.railway.app  
**Reviewed baseline default-branch SHA:** `4a3fe456b9fceb949ba6bd4132c96f87f501459f`  
**Purpose-defining software merge SHA before this review:** `f0d3b64b9ae17f70ef2656b173cd51ca4c71215b`  
**Current correction PR:** #123  
**Status:** `BLOCKED`  
**Updated:** 2026-08-09  

## Purpose and acceptance contract

GeneMap Discovery is a genetics **education and early-research** platform that must:

- separate AI-generated candidate leads from verified evidence
- show source, species, version, retrieval date, and evidence provenance for material claims
- let an authenticated learner move from lessons into gene search and research workflows
- keep human, animal, computational, and external-follow-up evidence visibly distinct
- use deterministic normalization and benchmarks for material scientific assertions
- remain impossible to mistake for diagnosis or clinical decision support

**Not in publishable scope:** personalized clinical AI, Clinical Support, Medical Data UI, diagnosis, personal-risk prediction, PGx, dosing, drug avoidance, screening urgency, or trial matching.

## Ready criteria (Exit 54-57)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 54 | Full CI/browser journeys; high-risk clinical routes impossible in publishable builds | **PASS (software boundary)** | `clinicalPublishingBoundary.test.js` verifies the publication flags, route graph, navigation graph, shared client, and Research Mode omit high-risk clinical surfaces. `publication-boundary.spec.js` installs a synthetic authenticated education session, attempts every removed route directly, and requires a Page Not Found result. The reviewed production bundle also omitted the named clinical pages. This proves the software boundary; it does not substitute for the still-missing owner-authorized live learner journey. |
| 55 | Each ranked association or variant assertion exposes source, version, evidence class, species, and retrieval date | **IN PROGRESS (PR #123)** | Existing association-claim contracts and search tests create and rank source/species/version/retrieval-bearing claims. PR #123 adds a representative rendered `GeneCard` test and makes printable reports and copied summaries preserve the full claim-level provenance tuple, fail closed when claims are absent, escape untrusted content, reject non-HTTP(S) source links, tolerate null input, and render non-finite numbers as `N/A`. This criterion must not be marked passed on the release until PR #123 is green, merged, deployed, and its actual output is inspected. |
| 56 | Known benchmark fixtures reproduce; limitations documented; no silent human/animal mixing | **PASS (software)** | `services/api/fixtures/benchmarks/` and `scientificBenchmarks.test.js` are exercised by CI; claim partitioning keeps human, animal, computational, AI-lead, and external-follow-up evidence distinct. |
| 57 | Public positioning is education and early research only, with no diagnostic, treatment, or personalized-medicine promise | **PASS (reviewed baseline)** | Live metadata describes an education and exploratory-research workspace. Privacy, Terms, Search, and the report footer prohibit diagnosis, personal-risk prediction, treatment, PGx, dosing, screening, and other clinical use. |

## Bridge (48-53)

| # | Bridge item | Status |
|---|-------------|--------|
| 48 | Remove or hard-disable personalized clinical AI and related paths; add regression tests | **PASS (software boundary)** - static route/client tests plus synthetic-authenticated direct-route Playwright coverage and reviewed live-bundle absence |
| 49 | Provenance-first association model | **IN PROGRESS (PR #123)** - data contract and search path exist; rendered and exported provenance completion is awaiting clean merge/deploy/output inspection |
| 50 | Separate human, animal, computational, and external follow-up evidence | **PASS (software)** - partition helpers; HPO term presence is `external_followup`, not curated association evidence |
| 51 | Reference build and deterministic variant normalization | **PASS (software)** - `variantNormalize.js` is wired into `vcf.js` with pinned reference/source versions |
| 52 | Deterministic scientific benchmarks and synthetic demonstrations | **PASS (software)** - ClinGen/ClinVar, HPO/Monarch, and GIAB fixtures |
| 53 | Privacy, processor, and subprocessor review; no HIPAA claim without evidence | **BLOCKED** - executed DPAs, named owners, regions, retention/deletion evidence, production launch evidence, and counsel/security approval remain incomplete |

## Verification evidence

```text
Previously merged implementation evidence:
  @genemap/shared vitest                    -> 86 passed
  API variantNormalize + benchmarks        -> 10 passed
  Web PhenotypeSearch + clinicalBoundary   -> 34 passed
  pnpm audit after js-yaml/nanoid bump      -> no known vulnerabilities

Reviewed baseline SHA:
  4a3fe456b9fceb949ba6bd4132c96f87f501459f

Baseline CI workflow run 31287331407         -> success
  verify-migrations                          -> success
  security-audit                             -> success
  lint-and-typecheck                         -> success
  test                                       -> success
  api-integration-postgres                   -> success
  migration-smoke                            -> success
  build-web                                  -> success
  docker-build-api                           -> success
  desktop-build-smoke                        -> success
  desktop-build-windows-smoke                -> success

Baseline Web Tests run 31287331405            -> success
  backup safeguards                          -> success
  build shared package                       -> success
  Web tests (Vitest + jsdom)                 -> success
  Web typecheck                              -> success
  Build web bundle                           -> success
  Verify publication bundle excludes clinical code -> success
  Authenticated publication-boundary browser journeys -> success

Baseline Production Smoke run 31298925133    -> success
  Live health, readiness, CORS, and web shell -> success
  E2E (public surface, Chromium)             -> success

Baseline deployment and live identity:
  GitHub Vercel deployment status            -> success
  GitHub Railway deployment status           -> success
  Vercel production deployment               -> READY @ 4a3fe456
  Live web shell                             -> HTTP 200
  Production route bundle                    -> Search, Dashboard, and Research Mode are structurally included in the authenticated route configuration

Current PR #123 release-candidate additions:
  Printable gene report                     -> full claim provenance, candidate-label notices, escaped values, safe source links
  Copied gene summary                       -> full claim provenance and fail-closed candidate labeling
  GeneCard representative render test       -> source, record, release/version, evidence class, species, retrieval date, source link
  Export regression tests                   -> complete tuple, no-claim state, script escaping, javascript-link rejection, null input, non-finite numbers, print output
  Final CI / merge / deployment / output    -> pending at the time of this record
```

## Actual blockers and exact owner action packet

GeneMap Discovery remains `BLOCKED`. Code completion, green CI, a successful deployment, or a healthy endpoint do not satisfy the privacy, operations, and real-release acceptance gates.

### A. Complete the processor and subprocessor register

Complete every applicable unchecked item in `docs/PROCESSOR_REGISTER.md`:

1. Name an accountable Axiom owner for every active or conditional service.
2. Identify the Redis operator, or remove `REDIS_URL` from production.
3. Record exact account/project identifiers, selected regions, and data locations.
4. Execute or verify applicable DPAs and document plan eligibility.
5. Review each current subprocessor list and subscribe to change notices.
6. Record retention, deletion, export, logging, training, and support-access settings.
7. Verify processor deletion propagation with test evidence.
8. Verify backups, logs, email, error telemetry, and billing exceptions in the deletion manifest.
9. Obtain counsel and security-owner approval for the public policy and data map.
10. Keep HIPAA, BAA, medical-device, clinical-readiness, and similar claims out of public copy unless independently evidenced for the exact production configuration.

### B. Complete the production-launch evidence file exactly as the verifier requires

Create `ops/production-launch-evidence.json` from `ops/production-launch-evidence.example.json`. The verifier in `scripts/verify-production-launch.mjs` requires these exact fields and conditions:

- `reviewedBy`
- `reviewedAt` within 30 days
- `productionSecrets.storedInSecretManager = true`
- `productionSecrets.rotatedForLaunch = true`
- `productionSecrets.manager`
- `backups.automaticBackupsEnabled = true`
- `backups.retentionDays >= 7`
- `backups.lastSuccessfulBackupAt` within 2 days
- `backups.restoreTestedAt` within 90 days
- `backups.restoreRunbook`
- `monitoring.errorTrackingConfigured = true`
- `monitoring.logAggregationConfigured = true`
- `monitoring.alertingConfigured = true`
- `monitoring.dashboardUrl` as a production HTTPS URL
- `monitoring.pagerEscalation`
- `stripe.liveMode = true`
- `stripe.webhookEndpoint` as HTTPS ending in `/billing/webhook`
- `stripe.webhookEvents` containing all six required events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, and `invoice.payment_failed`
- `stripe.lastWebhookTestAt` within 30 days
- `dataRetention.policyApproved = true`
- `dataRetention.policyDocument`
- `dataRetention.deletionRequestSlaDays` between 1 and 30
- `dataRetention.backupRetentionDays >= 7`
- `legalCompliance.legalReviewCompleted = true`
- `legalCompliance.complianceReviewCompleted = true`
- `legalCompliance.reviewer`
- `legalCompliance.reviewedAt` within 365 days
- `legalCompliance.medicalDisclaimerApproved = true`
- `legalCompliance.baaStatus` equal to `signed` or `not_required`

Run the verifier from an owner-authorized environment containing the real production configuration and secrets:

```bash
node scripts/verify-production-launch.mjs \
  --web-url=https://genemap-discovery.vercel.app \
  --api-url=https://genemap-api-production.up.railway.app \
  --evidence=ops/production-launch-evidence.json
```

A hand-written readiness statement is not a substitute for a zero-failure verifier result.

### C. Capture the required real authenticated learner journey

Using an owner-authorized test account on the exact deployed release:

1. Sign in.
2. Start, complete, or intentionally leave a lesson and verify progress behavior.
3. Open Gene Search from the authenticated navigation.
4. Execute a source-checkable candidate-gene search.
5. Inspect the rendered claim-level provenance.
6. Open Research Mode and verify the intended research workflow.
7. Print or save a gene report and inspect the provenance section.
8. Copy the gene summary and inspect the provenance fields.
9. Sign out and verify protected routes reject the unauthenticated session.
10. Retain redacted screenshots, logs, and the exact release SHA without using personal genomic data.

This journey is a blocking action, not an optional suggestion.

## Deployment and rollback contract

- Reviewed GitHub `main` baseline: `4a3fe456b9fceb949ba6bd4132c96f87f501459f`.
- Purpose-defining baseline software is contained in ancestor merge `f0d3b64b9ae17f70ef2656b173cd51ca4c71215b`.
- PR #123 changes user-visible export/share behavior and therefore must pass full CI, substantive review, merge, exact-SHA deployment verification, and output inspection before its provenance work can be treated as released.
- Vercel production identified the exact reviewed baseline SHA `4a3fe456` and was READY at baseline review time. GitHub reported successful Vercel and Railway deployment contexts for that same SHA.
- **Immutable rollback target for PR #123:** `4a3fe456b9fceb949ba6bd4132c96f87f501459f`.
- PR #123 contains no database schema or migration change. If the release must be rolled back, redeploy the web and API artifacts built from the immutable rollback SHA, retain the current compatible database, then verify `/healthz`, `/readyz`, the public web shell, and the publication-boundary browser journey against that exact SHA.
- Do not choose a rollback target during an incident. A different target requires a separate pre-incident review, deployment identity check, data-compatibility assessment, and recorded recovery test.
- The final merged software SHA and post-merge deployment evidence must be recorded after PR #123 merges; this file deliberately does not predict its own future merge SHA.
- Local launch information above is historical evidence only until independently verified on Dr. White's Windows machine.

## Current PR #123 files

- `apps/web/lib/exportUtils.js`
- `apps/web/lib/__tests__/exportUtils.test.js`
- `apps/web/components/search/__tests__/GeneCard.provenance.test.jsx`
- `docs/production-readiness/genemap-discovery.md`

## Production-ready decision

**`BLOCKED`**

The reviewed baseline is deployed and its accessible engineering gates are healthy. PR #123 still requires clean integration and exact-release verification, and the owner-controlled processor/privacy, production-launch, and authenticated-journey evidence remains incomplete. No weaker phrase such as "software complete," "ready except for," or "external release blocker" substitutes for the required status.
