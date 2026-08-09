# Axiom GeneMap Discovery - Production Readiness Report

**Program:** Axiom GeneMap Discovery  
**Executor:** ChatGPT  
**Working branch:** `chatgpt/production-ready/genemap-discovery`  
**Repo:** buckeye7066/genemap-discovery (private; default `main`)  
**Local path recorded by prior executor:** `C:\Users\firer\genemap-discovery` (not independently accessible from this session)  
**Deployed app:** https://genemap-discovery.vercel.app  
**API:** https://genemap-api-production.up.railway.app  
**Current default-branch SHA:** `4a3fe456b9fceb949ba6bd4132c96f87f501459f`  
**Purpose-defining software merge SHA:** `f0d3b64b9ae17f70ef2656b173cd51ca4c71215b`  
**Implementation PR:** https://github.com/buckeye7066/genemap-discovery/pull/121 (merged 2026-08-09T00:51:04Z)  
**Evidence PR:** https://github.com/buckeye7066/genemap-discovery/pull/122 (merged 2026-08-09T00:59:23Z)  
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
| 54 | Full CI/browser journeys; high-risk clinical routes impossible in publishable builds | **PASS (software)** | PR #121 CI: lint/typecheck, test, web-tests, security-audit, api-integration, docker-build, migration-smoke, desktop smokes all green. Live main bundle `index-BttzNX1u.js`: `MedicalData`, `RobertClinical`, `VCFAnalysis`, `AIAssistants`, `Anastasia`, and `ClinicalTrial` are absent. `LearnGenetics`, `Search`, and `ResearchMode` are present. |
| 55 | Each ranked association or variant assertion exposes source, version, evidence class, species, and retrieval date | **PASS (software)** | Live Search chunk `Search-BDj6Phyh.js` contains `associationClaims`, `association-claims`, `human_verified`, `ai_lead`, `AI research lead`, `retrieved`, and `evidenceClass`. Variant normalization pins GRCh38 and named gnomAD/ClinVar versions in the API. |
| 56 | Known benchmark fixtures reproduce; limitations documented; no silent human/animal mixing | **PASS (software)** | `services/api/fixtures/benchmarks/` and `scientificBenchmarks.test.js` are exercised by CI. |
| 57 | Public positioning is education and early research only, with no diagnostic, treatment, or personalized-medicine promise | **PASS (software)** | Live metadata describes an education and exploratory-research workspace. Privacy, Terms, and Search copy prohibit diagnosis, treatment, PGx, and dosing use. |

## Bridge (48-53)

| # | Bridge item | Status |
|---|-------------|--------|
| 48 | Remove or hard-disable personalized clinical AI and related paths; add regression tests | **PASS (software)** - route map, `clinicalPublishingBoundary.test.js`, and live-bundle probe |
| 49 | Provenance-first association model | **PASS (software)** - `associationClaim.ts`, UI, exports, and live Search chunk |
| 50 | Separate human, animal, computational, and external follow-up evidence | **PASS (software)** - partition helpers; HPO term presence classified as `external_followup`, not curated association |
| 51 | Reference build and deterministic variant normalization | **PASS (software)** - `variantNormalize.js` wired into `vcf.js` |
| 52 | Deterministic scientific benchmarks and synthetic demonstrations | **PASS (software)** - ClinGen/ClinVar, HPO/Monarch, and GIAB fixtures |
| 53 | Privacy, processor, and subprocessor review; no HIPAA claim without evidence | **BLOCKED** - repository inventory is complete, but executed DPAs, named owners, regions, retention/deletion evidence, and counsel/security approval remain incomplete |

## Verification evidence

```text
Implementation verification:
  @genemap/shared vitest                    -> 86 passed
  API variantNormalize + benchmarks        -> 10 passed
  Web PhenotypeSearch + clinicalBoundary   -> 34 passed
  pnpm audit after js-yaml/nanoid bump      -> no known vulnerabilities

CI for implementation PR #121:
  security-audit, lint-and-typecheck, test, web-tests,
  api-integration-postgres, docker-build-api, migration-smoke,
  build-web, desktop-build-smoke, desktop-build-windows-smoke -> pass

Independent connected-tool re-verification on 2026-08-09:
  GitHub default branch                     -> main @ 4a3fe456
  Open pull requests                        -> 0
  GitHub deployment status on exact SHA     -> Vercel success; Railway success
  Exact-SHA checks                          -> no failed check run found
  Live health/readiness/CORS/web-shell job  -> success
  Public Chromium E2E                       -> success
  Vercel production deployment              -> READY @ 4a3fe456
  Live web shell                            -> HTTP 200
  Live route bundle                         -> Gene Search, Dashboard, and Research Mode available to authenticated users
```

## Actual blocker and exact owner action packet

GeneMap Discovery remains `BLOCKED`. Code completion, green CI, a successful deployment, or a healthy endpoint do not satisfy the privacy and operational acceptance gate.

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

An authenticated learner journey on the exact live release should also be captured after owner-authorized test-account access: sign in, finish or leave a lesson, open Gene Search, execute a source-checkable search, open Research Mode, inspect provenance, sign out, and retain screenshots/log evidence without personal genomic data.

## Deployment and rollback contract

- Current GitHub `main`: `4a3fe456b9fceb949ba6bd4132c96f87f501459f`.
- Purpose-defining software is contained in ancestor merge `f0d3b64b9ae17f70ef2656b173cd51ca4c71215b`; the later commits are readiness-documentation updates.
- Vercel production identifies exact current `main` SHA `4a3fe456` and is READY.
- GitHub reports successful Vercel and Railway deployment contexts for exact current `main`.
- Rollback target for the software wave is the last known-good pre-wave default-branch SHA, selected and recorded before rollback; database rollback must use forward-compatible migrations or a verified restore, never an unreviewed schema downgrade.
- Local launch information above is historical evidence only until independently verified on Dr. White's Windows machine.

## Files changed in the purpose-defining software wave

- `packages/shared/src/associationClaim.ts` plus tests and package export
- `apps/web/components/search/PhenotypeSearchService.jsx`, `GeneCard.jsx`, and `lib/exportUtils.js`
- `services/api/src/services/variantNormalize.js` plus tests and `vcf.js`
- `services/api/fixtures/benchmarks/*` and `scientificBenchmarks.test.js`
- `services/api/src/config/publicationTaskContracts.js`
- `package.json` and `pnpm-lock.yaml` overrides for js-yaml >=4.3.1 and nanoid >=3.3.17
- `docs/PROCESSOR_REGISTER.md`

## Production-ready decision

**`BLOCKED`**

The software release candidate is deployed and its accessible engineering gates are green. Production readiness is withheld because the processor/privacy operational gate and owner-authorized authenticated release evidence are not complete. No weaker phrase such as "software complete," "ready except for," or "external release blocker" substitutes for the required status.
