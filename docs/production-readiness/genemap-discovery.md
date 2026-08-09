# Axiom GeneMap Discovery — Production Readiness Report

**Program:** Axiom GeneMap Discovery  
**Agent:** production-agent-genemap-discovery  
**Branch:** `production-ready/genemap-discovery`  
**Repo:** buckeye7066/genemap-discovery (private; default `main`)  
**Local:** `C:\Users\firer\genemap-discovery`  
**Deployed app:** https://genemap-discovery.vercel.app  
**API:** https://genemap-api-production.up.railway.app  
**Main SHA (merged):** `f0d3b64b9ae17f70ef2656b173cd51ca4c71215b`  
**PR:** https://github.com/buckeye7066/genemap-discovery/pull/121 (**MERGED** 2026-08-09T00:51:04Z)  
**Board status:** SOFTWARE COMPLETE, EXTERNAL RELEASE BLOCKER (processor/DPA owner gate)  
**Updated:** 2026-08-09  

## Purpose (from Master Prompt — not inferred from name)

Genetics **education and early-research** platform that:

- separates AI-generated candidate leads from verified evidence
- shows source / species / version / retrieval provenance for material claims
- cannot be mistaken for diagnostic or clinical decision-support software

**Not in publishable scope:** personalized clinical AI, Clinical Support, Medical Data UI, diagnosis, personal-risk, PGx, dosing, drug-avoidance, screening urgency, or trial-matching paths.

## Ready criteria (Exit 54–57)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 54 | Full CI/browser journeys; high-risk clinical routes impossible in publishable builds | **PASS (software)** | PR #121 CI: lint/typecheck, test, web-tests, security-audit, api-integration, docker-build, migration-smoke, desktop smokes — all green. Live main bundle `index-BttzNX1u.js`: `MedicalData`/`RobertClinical`/`VCFAnalysis`/`AIAssistants`/`Anastasia`/`ClinicalTrial` = **absent**. `LearnGenetics` present. |
| 55 | Each ranked association / variant assertion exposes source, version, evidence class, species, retrieval date | **PASS (software)** | Live Search chunk `Search-BDj6Phyh.js` contains `associationClaims`, `association-claims`, `human_verified`, `ai_lead`, `AI research lead`, `retrieved`, `evidenceClass`. Variant normalization pins GRCh38 + gnomAD/ClinVar versions in API. |
| 56 | Known benchmark fixtures reproduce; documented limitations; no silent human/animal mixing | **PASS (software)** | `services/api/fixtures/benchmarks/` + `scientificBenchmarks.test.js` (CI `test` job). |
| 57 | Public positioning = education / early research only; no diagnostic / treatment / personalized-med promise | **PASS (software)** | Live meta description: “education and exploratory research workspace…”. Privacy/Terms/Search copy forbid diagnosis/treatment/PGx/dosing. |

## Bridge (48–53)

| # | Bridge item | Done |
|---|-------------|------|
| 48 | Remove/hard-disable personalized clinical AI and related paths; regression tests | **Yes** — route map + `clinicalPublishingBoundary.test.js` + live bundle probe |
| 49 | Provenance-first association model | **Yes** — `associationClaim.ts` + UI + live Search chunk |
| 50 | Separate human vs animal vs computational; external DB links = follow-up only | **Yes** — partition helpers; HPO term presence classed as `external_followup` (not curated association) |
| 51 | Reference build + deterministic variant normalization | **Yes** — `variantNormalize.js` wired into `vcf.js` |
| 52 | Deterministic scientific benchmarks + synthetic demos | **Yes** — ClinGen/ClinVar, HPO/Monarch, GIAB fixtures |
| 53 | Privacy/processor-subprocessor review; no HIPAA claim without evidence | **Software yes / owner no** — `docs/PROCESSOR_REGISTER.md`; executed DPAs/regions/retention/deletion/counsel incomplete |

## Verification runs (this session)

```text
Local:
  @genemap/shared vitest                 → 86 passed
  API variantNormalize + benchmarks        → 10 passed
  Web PhenotypeSearch + clinicalBoundary → 34 passed
  pnpm audit (after js-yaml/nanoid bump) → No known vulnerabilities

CI (PR #121 @ 99e127d → merge f0d3b64):
  security-audit, lint-and-typecheck, test, web-tests,
  api-integration-postgres, docker-build-api, migration-smoke,
  build-web, desktop-build-smoke, desktop-build-windows-smoke → pass

Deploy:
  GitHub Production deployment 5814217540 sha=f0d3b64 state=success (Vercel)
  Railway deployment 5814215986 sha=f0d3b64 state=success
  Railway Deploy Monitor run 31287050501 → success
  GET https://genemap-discovery.vercel.app → 200; education meta
  GET https://genemap-api-production.up.railway.app/healthz → 200 {"status":"ok"}
  Live Search-BDj6Phyh.js provenance strings present; clinical page ids absent
```

## Blockers — SOFTWARE COMPLETE, EXTERNAL RELEASE BLOCKER

1. **Processor / privacy owner gate (Bridge 53)** — complete checklist in `docs/PROCESSOR_REGISTER.md` (named owners, DPAs, regions, retention/deletion evidence, counsel/security approval).
2. Optional: authenticated learner E2E on the exact live SHA after owner unlock (login-gated Search enrichment journey).

## Launch / deploy contract

- GitHub `main` @ `f0d3b64` → Vercel web + Railway API (auto on merge; both reported success for this SHA).
- Local: `C:\Users\firer\genemap-discovery` → `corepack pnpm install` → `corepack pnpm test` / `dev`.

## Files changed this wave

- `packages/shared/src/associationClaim.ts` (+ tests, package export)
- `apps/web/components/search/PhenotypeSearchService.jsx`, `GeneCard.jsx`, `lib/exportUtils.js`
- `services/api/src/services/variantNormalize.js` (+ tests), `vcf.js`
- `services/api/fixtures/benchmarks/*` + `scientificBenchmarks.test.js`
- `services/api/src/config/publicationTaskContracts.js`
- `package.json` / `pnpm-lock.yaml` — js-yaml ≥4.3.1, nanoid ≥3.3.17 overrides
- `docs/PROCESSOR_REGISTER.md`, `docs/production-readiness/genemap-discovery.md`
