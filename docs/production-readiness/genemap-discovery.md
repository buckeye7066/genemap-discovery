# Axiom GeneMap Discovery — Production Readiness Report

**Program:** Axiom GeneMap Discovery  
**Agent:** production-agent-genemap-discovery  
**Branch:** `production-ready/genemap-discovery`  
**Repo:** buckeye7066/genemap-discovery (private; default `main`)  
**Local:** `C:\Users\firer\genemap-discovery`  
**Deployed app:** https://genemap-discovery.vercel.app  
**Main SHA (pre-merge baseline):** `8100e2485ac23151a9be38257e591a08130fbd43`  
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
| 54 | Full CI/browser journeys; high-risk clinical routes impossible in publishable builds | **PASS (software)** | `pages.config.js` omits MedicalData, VCFAnalysis, AIAssistants, Anastasia, RobertClinical, VisualizationHub, GSEA. `lib/__tests__/clinicalPublishingBoundary.test.js` **19/19**. Prior publication remediation on main (`6b1d693`). |
| 55 | Each ranked association / variant assertion exposes source, version, evidence class, species, retrieval date | **PASS (software)** | `packages/shared/src/associationClaim.ts` + `PhenotypeSearchService.attachProvenance` + `GeneCard` claim UI. LLM self-scores stripped (`stripLlmSelfScores`). Variant rows carry `referenceBuild`, `hgvs`, `provenance.gnomadVersion` / `clinvarVersion` via `variantNormalize.js`. |
| 56 | Known benchmark fixtures reproduce; documented limitations; no silent human/animal mixing | **PASS (software)** | Fixtures under `services/api/fixtures/benchmarks/` (ClinGen/ClinVar BRCA1, HPO/Monarch seizure, GIAB HG002). `scientificBenchmarks.test.js` **5/5** partitions species and locks expected normalization. |
| 57 | Public positioning = education / early research only; no diagnostic / treatment / personalized-med promise | **PASS (software)** | Live meta description (HTTP 200): education + exploratory research. Privacy/Terms/Search copy forbid diagnosis, treatment, PGx, dosing. Publication task prompts forbid clinical invention. |

## Bridge (48–53)

| # | Bridge item | Done |
|---|-------------|------|
| 48 | Remove/hard-disable personalized clinical AI and related paths; regression tests | **Yes** — route map + `clinicalPublishingBoundary.test.js` |
| 49 | Provenance-first association model (source, record ID, claim, taxon, evidence type/strength, version, retrieval, link) | **Yes** — `associationClaim.ts` + UI |
| 50 | Separate human vs animal vs computational evidence; external DB links = follow-up only | **Yes** — `partitionClaimsBySpecies` / `evidencePartition` + GeneCard copy |
| 51 | Reference build + deterministic variant normalization (left-align, multiallelic, HGVS, ANN/CSQ, gnomAD/ClinVar pins) | **Yes** — `variantNormalize.js` wired into `vcf.js` |
| 52 | Deterministic scientific benchmarks (ClinGen/ClinVar, HPO/Monarch, GIAB) + synthetic demos | **Yes** — fixtures + tests |
| 53 | Genomic privacy / retention / deletion / processor-subprocessor review; no HIPAA claim without evidence | **Software yes / owner no** — `docs/PROCESSOR_REGISTER.md` inventory + public HIPAA claims removed; **executed DPAs, regions, retention, deletion proof, counsel sign-off incomplete** |

## Verification runs (this session)

```text
@genemap/shared vitest                 → 86 passed (incl. associationClaim 5)
@genemap/api variantNormalize + benches → 10 passed
@genemap/web PhenotypeSearch + clinical → 34 passed
Live GET https://genemap-discovery.vercel.app → HTTP 200; education meta present
```

## Blockers — SOFTWARE COMPLETE, EXTERNAL RELEASE BLOCKER

1. **Processor / privacy owner gate (Bridge 53)** — complete checklist in `docs/PROCESSOR_REGISTER.md` (named owners, DPAs, regions, retention/deletion evidence, counsel/security approval). Softward inventory and fail-closed publication boundary are done; legal/ops evidence is not.
2. Optional: full authenticated browser E2E on exact post-merge deploy SHA after Vercel+API roll out (login-gated journeys).

## Launch / deploy contract

- GitHub `main` → Vercel web (`genemap-discovery.vercel.app`); API on Railway (processor register).
- Local: `C:\Users\firer\genemap-discovery` → `corepack pnpm install` → `corepack pnpm test` / `dev`.

## Files changed this wave

- `packages/shared/src/associationClaim.ts` (+ tests, package export)
- `apps/web/components/search/PhenotypeSearchService.jsx` (+ tests)
- `apps/web/components/search/GeneCard.jsx`
- `services/api/src/services/variantNormalize.js` (+ tests)
- `services/api/src/services/vcf.js`
- `services/api/fixtures/benchmarks/*` + `scientificBenchmarks.test.js`
- `services/api/src/config/publicationTaskContracts.js` (no LLM self-scores)
- `docs/PROCESSOR_REGISTER.md`, `docs/production-readiness/genemap-discovery.md`
