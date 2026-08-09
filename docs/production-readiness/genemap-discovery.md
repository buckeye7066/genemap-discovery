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
**Current release-candidate PR:** #123  
**Current phase:** `TESTING`  
**Release status:** `BLOCKED`  
**Updated:** 2026-08-09  

## Purpose and acceptance contract

GeneMap Discovery is a genetics **education and early-research** platform that must:

- separate AI-generated candidate leads from verified evidence
- show source, species, taxon, source release/version, reference assembly, retrieval date, evidence type, evidence strength, and AI-lead status for material provenance rows
- distinguish genuine gene-query association evidence from gene identity, coordinate, ontology, and follow-up-source metadata
- let an authenticated learner move from lessons into gene search and research workflows
- keep human, animal, computational, AI-lead, and external-follow-up evidence visibly distinct
- use deterministic normalization and benchmarks for material scientific assertions
- treat every model response as untrusted data and enforce task-specific publication boundaries before browser use
- remain impossible to mistake for diagnosis or clinical decision support

**Not in publishable scope:** personalized clinical AI, Clinical Support, Medical Data UI, diagnosis, personal-risk prediction, PGx, dosing, drug avoidance, screening urgency, treatment recommendation, or trial matching.

## Ready criteria (Exit 54-57)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 54 | Full CI/browser journeys; high-risk clinical routes impossible in publishable builds | **PASS (software boundary)** | `clinicalPublishingBoundary.test.js` verifies the publication flags, route graph, navigation graph, shared client, and Research Mode omit high-risk clinical surfaces. `publication-boundary.spec.js` installs a synthetic authenticated education session, attempts every removed route directly, and requires a Page Not Found result. The reviewed production bundle also omitted the named clinical pages. This proves the software route boundary; it does not substitute for the still-missing owner-authorized live learner journey. |
| 55 | Every displayed evidence or metadata row exposes its provenance without overstating association support | **IN PROGRESS (PR #123)** | PR #123 now labels each row as `association_evidence`, `ai_candidate_lead`, or `source_metadata`; uses one shared association-ranking contract across cards, print, and copied text; renders source, record ID, source release/version, reference assembly, evidence class/type/strength, species, taxon, retrieval date, AI-lead status, and validated source link with explicit missing values; and keeps identity/HPO/link metadata from promoting candidate ranking. This criterion remains pending until exact-head CI, substantive review, merge, deployment, and actual output inspection are complete. |
| 56 | Known benchmark fixtures reproduce; limitations documented; no silent human/animal mixing | **PASS (software)** | `services/api/fixtures/benchmarks/` and `scientificBenchmarks.test.js` are exercised by CI; claim partitioning keeps human, animal, computational, AI-lead, and external-follow-up evidence distinct. |
| 57 | Public positioning and generated output remain education/early research only | **IN PROGRESS (PR #123)** | Baseline public metadata, Privacy, Terms, and Search copy prohibit clinical use. PR #123 adds task-specific server output containment for candidate-gene JSON, aggregate research, research hypotheses, and learning summaries; drops or withholds model-generated clinical guidance; strips provider-created HTML and links; bounds narrative output; and keeps safe educational disclaimers. Release evidence is still pending. |

## Bridge (48-53)

| # | Bridge item | Status |
|---|-------------|--------|
| 48 | Remove or hard-disable personalized clinical AI and related paths; add regression tests | **PASS (software boundary)** - static route/client tests plus synthetic-authenticated direct-route Playwright coverage and reviewed live-bundle absence |
| 49 | Provenance-first association model | **IN PROGRESS (PR #123)** - one shared role/ranking contract, separate source release and reference assembly fields, safe links, complete UI/report/share provenance, and explicit missing values are awaiting clean merge/deploy/output inspection |
| 50 | Separate human, animal, computational, AI-lead, and external follow-up evidence | **PASS (software)** - partition helpers and row-role labels; HPO term presence is source metadata, not curated association evidence |
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
  Shared claim contract                     -> safe links; source release separated from reference assembly; shared provenance role and ranking derivation
  GeneCard                                  -> association evidence, AI lead, and source metadata labeled separately; complete stable values and safe links
  Printable gene report                     -> same role/ranking contract, complete provenance, candidate-label notices, escaped values
  Copied gene summary                       -> same ranking fallback and stable role/provenance fields including assembly and AI-lead status
  Candidate-gene API output                 -> server-owned JSON parsing, field narrowing, symbol normalization, deduplication, caps, clinical-text rejection, control removal, fail-closed structures
  Research/learning API output              -> bounded task-specific narrative normalization; active markup/link removal; clinical-guidance withholding; deterministic empty states
  Regression tests                          -> ranking semantics, metadata roles, source release vs assembly, complete card/report/share fields, unsafe links, clinical prose, all structured tasks, malformed JSON, null and non-finite values
  Final CI / review / merge / deployment / output -> pending at the time of this record
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
5. Inspect row roles and the complete provenance values.
6. Open Research Mode and verify the intended aggregate research workflow.
7. Print or save a gene report and inspect its ranking and provenance sections.
8. Copy the gene summary and inspect its role, version, assembly, evidence, species/taxon, retrieval, and AI-lead fields.
9. Sign out and verify protected routes reject the unauthenticated session.
10. Retain redacted screenshots, logs, and the exact release SHA without using personal genomic data.

This journey is a blocking action, not an optional suggestion.

## Deployment and rollback contract

- Reviewed GitHub `main` baseline: `4a3fe456b9fceb949ba6bd4132c96f87f501459f`.
- Purpose-defining baseline software is contained in ancestor merge `f0d3b64b9ae17f70ef2656b173cd51ca4c71215b`.
- PR #123 changes user-visible provenance rendering/export/share behavior, association-ranking semantics, source-version/assembly representation, the shared claim-link contract, and every published structured AI output boundary. It must pass full CI, substantive fresh review, merge, exact-SHA deployment verification, and output inspection before its work can be treated as released.
- Vercel production identified the exact reviewed baseline SHA `4a3fe456` and was READY at baseline review time. GitHub reported successful Vercel and Railway deployment contexts for that same SHA.
- **Immutable rollback target for PR #123:** `4a3fe456b9fceb949ba6bd4132c96f87f501459f`.
- PR #123 contains no database schema or migration change. If the release must be rolled back, redeploy the web and API artifacts built from the immutable rollback SHA, retain the current compatible database, then verify `/healthz`, `/readyz`, the public web shell, and the publication-boundary browser journey against that exact SHA.
- Do not choose a rollback target during an incident. A different target requires a separate pre-incident review, deployment identity check, data-compatibility assessment, and recorded recovery test.
- The final merged software SHA and post-merge deployment evidence must be recorded after PR #123 merges; this file deliberately does not predict its own future merge SHA.
- Local launch information above is historical evidence only until independently verified on Dr. White's Windows machine.

## Current PR #123 files

- `packages/shared/src/associationClaim.ts`
- `packages/shared/src/__tests__/associationClaim.test.ts`
- `apps/web/components/search/GeneCard.jsx`
- `apps/web/components/search/__tests__/GeneCard.provenance.test.jsx`
- `apps/web/components/search/__tests__/PhenotypeSearchService.test.js`
- `apps/web/lib/exportUtils.js`
- `apps/web/lib/__tests__/exportUtils.test.js`
- `services/api/src/services/publicationTaskOutput.js`
- `services/api/src/__tests__/publicationTaskOutput.test.js`
- `services/api/src/routes/llm.js`
- `docs/production-readiness/genemap-discovery.md`

## Production-ready decision

**`BLOCKED`**

The reviewed baseline is deployed and its accessible engineering gates are healthy. PR #123 still requires clean integration and exact-release verification, and the owner-controlled processor/privacy, production-launch, and authenticated-journey evidence remains incomplete. No green build, merged pull request, deployment badge, or self-authored readiness report changes that status by itself.
