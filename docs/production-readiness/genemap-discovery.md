# Axiom GeneMap Discovery: Production Readiness Record

**Executor:** ChatGPT  
**Repository:** `buckeye7066/genemap-discovery`  
**Verified default branch:** `main`  
**Reviewed baseline SHA:** `4a3fe456b9fceb949ba6bd4132c96f87f501459f`  
**Implementation SHA immediately before this evidence-only record:** `89bc2ee2aded0855a85275b57f46ea54fb137fe5`  
**Release pull request:** `#123`  
**Web target:** `https://genemap-discovery.vercel.app`  
**API target:** `https://genemap-api-production.up.railway.app`  
**Current phase:** `MERGING`  
**Current release status:** `BLOCKED`  
**Updated:** 2026-08-09

This file records the software and evidence state without predicting its own future merge SHA. The exact final default-branch SHA, CI runs, deployment identity, and post-merge review belong in PR #123's immutable release evidence comment after merge.

## Purpose Contract

GeneMap Discovery is an approachable genetics education and early-research platform. It must let learners move from lessons into source-checkable gene discovery and structured aggregate research while clearly separating AI-generated candidate leads from verified evidence.

### Intended users

- learners studying genetics at supported education levels
- educators using guided genetics explanations, quizzes, and examples
- researchers organizing early, non-clinical candidate leads and aggregate-study hypotheses

### Purpose-defining workflows

1. Sign in and use genetics lessons without hidden clinical surfaces.
2. Move from learning into Gene Search.
3. Select a reviewed disease/phenotype reference or exact HPO identifier.
4. Generate bounded candidate-gene leads.
5. Distinguish AI leads, association evidence, identity/ontology metadata, species, taxon, source version, assembly, retrieval status, and source links.
6. Print or copy a provenance-preserving gene summary.
7. Open Research Mode, define a structured aggregate cohort, generate a bounded hypothesis, and download a self-identifying Markdown artifact.
8. Recover safely from provider or deployment failure without publishing model output or charging quota.

### Forbidden substitutes

GeneMap is not complete if it provides only generic AI prose, guessed identifiers, model self-scores, cosmetic evidence labels, unsafe links, clinical recommendations, a page-load smoke test, a preview deployment, or a self-authored readiness score.

## Release acceptance state

| Acceptance requirement | Evidence state |
|---|---|
| Lessons-to-research navigation | Implemented and covered by route/bundle and synthetic authenticated browser tests; owner-authorized production journey still required |
| AI leads separated from verified evidence | Implemented in shared claim-role and ranking contracts |
| Human, animal, computational, AI, and follow-up evidence separated | Implemented and regression-tested |
| Source/species/version/assembly/taxon/retrieval provenance | Implemented across GeneCard, print, and copied text; missing values remain explicit |
| Authoritative retrieval timestamps | MyGene/HPO adapters stamp successful source responses once; route response time is separately recorded as `adapterRetrievedAt` |
| Model output containment | Implemented for candidate genes, gene profiles, research narratives, learning summaries, explanations, tutor chat, quiz fields, and revised image prompts |
| Link/image containment | Server strips HTML, inline/reference Markdown targets, absolute URLs, active schemes, and protocol-relative URLs; React renderers make model links/images inert |
| Clinical boundary | Candidate symbols, names, synonyms, explanations, summaries, quiz content, educational output, and research output fail closed on actionable clinical guidance |
| Failure and recovery | `DISABLE_MODEL_PUBLICATION=1` returns 503 before quota accounting, prompt composition, or provider access and reports degraded readiness |
| Search quick starts | Reviewed catalog references or exact HPO identifiers only; misleading gene-symbol and unresolved-label shortcuts removed |
| Research artifact integrity | Download includes exact focus identity, control-group state, cohort, objective, modalities, generation time, and non-clinical boundary |
| Full exact-head gates | Required before merge; final run IDs and conclusions recorded on PR #123 |
| Exact-SHA production deployment | Required after merge |
| Owner-authorized authenticated production journey | Not yet supplied |
| Processor/privacy, backup/restore, monitoring, Stripe, and qualified review evidence | Not yet supplied |

## Implemented release scope

### Scientific and provenance integrity

- one association-ranking contract shared by cards, printable reports, copied summaries, and candidate ordering
- identity, coordinates, ontology records, and database links remain visible but cannot promote a candidate as association evidence
- source release/version and reference assembly are separate fields
- AI-lead status takes precedence over contradictory verified-looking metadata
- model self-scores are stripped before ranking or display
- real adapter retrieval dates are preserved across cache reuse; AI leads and unvisited external links remain unrecorded
- safe absolute HTTP(S) source links only

### Education and research publication boundary

- server-owned structured task contracts and query references
- candidate symbol normalization, deduplication, limits, and clinical-command rejection
- explicit gene-profile states: `available`, `withheld`, and `unavailable`
- bounded education, tutor, research, hypothesis, and learning narratives
- quiz questions fail closed as complete units so answer indices cannot shift
- direct medication instructions, including named-drug imperatives, are withheld
- generated Markdown links/images are inert even if upstream sanitization regresses

### Reliability, security, and recovery

- bounded mounted retry for failed gene-view activity writes with cancellation and successful-session de-duplication
- emergency model-publication circuit breaker before quota/provider work
- `/readyz` exposes the same recovery state
- no pre-containment revision is designated safe with provider credentials active
- VCF parsing and public-reference lookup remain deterministic and authenticated
- dependency, lint, typecheck, migration, API integration, web, browser, Docker, Linux desktop, and Windows packaging gates remain hard-fail release checks

## Verification matrix

The exact final head must pass all applicable gates below. The implementation SHA `89bc2ee2aded0855a85275b57f46ea54fb137fe5` had passing API/shared tests, lint/typecheck, security audit, migrations, API/Postgres integration, web build, Docker build, Linux desktop smoke, Vercel preview, and browser/publication-boundary coverage when this record was prepared; its Windows packaging smoke was still executing. This evidence-only commit must receive a fresh complete run.

| Gate | Required result |
|---|---|
| Frozen dependency install | success |
| Lint | success |
| Full configured typecheck | success |
| API Vitest | success |
| Shared-package Vitest | success |
| Web Vitest/jsdom | success |
| Postgres API integration | success |
| Migration verification and smoke | success |
| Dependency/security audit | success |
| Web production build | success |
| Publication bundle clinical-route exclusion | success |
| Synthetic authenticated browser journeys | success |
| API Docker build | success |
| Linux desktop build smoke | success |
| Windows NSIS build smoke | success |
| Vercel preview deployment | READY |
| Fresh CodeRabbit review | no unresolved release blocker |
| Fresh Codex review | no unresolved release blocker |
| Post-merge exact-SHA CI and review | success and clean |

### Adversarial regression coverage added

- `STOP-DRUG`, `TAKE-5MG`, and `TAKE-ASPIRIN` cannot pass as gene symbols
- `Take aspirin.`, `Aspirin is recommended.`, and scheduled metformin instructions are withheld
- safe neutral genetics education remains publishable
- reference-style links/images, HTML, active schemes, and protocol-relative targets become inert
- unsafe quiz questions are discarded without changing a safe question's answer index
- education recovery returns 503 before quota counting or provider invocation
- gene-profile rejection produces a safe withheld/unavailable state, never an invented association sentence
- route-level retrieval timestamps cannot overwrite immutable source-record timestamps
- Research Mode downloads preserve controls and exact focus identity
- Search quick starts execute reviewed references and omit misleading `hearing loss` and `BRCA1` phenotype shortcuts

## Exact PR #123 file inventory

1. `apps/web/components/education/AdaptiveExplanation.jsx`
2. `apps/web/components/education/__tests__/AdaptiveExplanation.safety.test.jsx`
3. `apps/web/components/research/HypothesisGenerator.jsx`
4. `apps/web/components/research/__tests__/HypothesisGenerator.download.test.jsx`
5. `apps/web/components/search/GeneCard.jsx`
6. `apps/web/components/search/PhenotypeSearchService.jsx`
7. `apps/web/components/search/__tests__/GeneCard.provenance.test.jsx`
8. `apps/web/components/search/__tests__/PhenotypeSearchService.test.js`
9. `apps/web/components/shared/__tests__/safeModelMarkdown.test.jsx`
10. `apps/web/components/shared/safeModelMarkdown.jsx`
11. `apps/web/lib/__tests__/exportUtils.test.js`
12. `apps/web/lib/exportUtils.js`
13. `apps/web/pages/Dashboard.jsx`
14. `apps/web/pages/Search.jsx`
15. `apps/web/pages/TopicExplorer.jsx`
16. `apps/web/pages/__tests__/Search.quickStarts.test.jsx`
17. `docs/PRODUCTION_READINESS_REPORT.md`
18. `docs/production-readiness/genemap-discovery.md`
19. `packages/shared/src/__tests__/associationClaim.test.ts`
20. `packages/shared/src/associationClaim.ts`
21. `services/api/.env.example`
22. `services/api/src/__tests__/education-model-recovery.test.js`
23. `services/api/src/__tests__/education-output-boundary.integration.test.js`
24. `services/api/src/__tests__/genomicEnrich.test.js`
25. `services/api/src/__tests__/genomicEnrich.timestamp.test.js`
26. `services/api/src/__tests__/genomicRetrievalProvenance.test.js`
27. `services/api/src/__tests__/llm-publication-recovery.test.js`
28. `services/api/src/__tests__/publicationTaskOutput.education-boundary.test.js`
29. `services/api/src/__tests__/publicationTaskOutput.securityRegression.test.js`
30. `services/api/src/__tests__/publicationTaskOutput.symbol-boundary.test.js`
31. `services/api/src/__tests__/publicationTaskOutput.symbolPolicy.test.js`
32. `services/api/src/__tests__/publicationTaskOutput.test.js`
33. `services/api/src/index.js`
34. `services/api/src/routes/education.js`
35. `services/api/src/routes/genomics.js`
36. `services/api/src/routes/llm.js`
37. `services/api/src/services/genomicDatabases.js`
38. `services/api/src/services/publicationTaskOutput.js`

## Deployment and rollback contract

1. Merge only the exact reviewed head after every required check concludes successfully.
2. Confirm CI on the exact merge/default-branch SHA.
3. Confirm Vercel and Railway deploy that exact SHA, not merely a newer or older successful build.
4. Run public, authenticated, API, write/read, output, and recovery journeys against that release.
5. During a model-output incident, set `DISABLE_MODEL_PUBLICATION=1` on the contained release.
6. Verify `/readyz` reports `degraded=true` and `modelPublication.status=disabled_for_safe_recovery`.
7. Verify authenticated generated-publication requests return 503 with no result, provider request, or quota increment.
8. Redeploy only a contained release SHA. A forced pre-containment deployment requires removal of provider credentials and remains a degraded emergency state.
9. Restore model publication only after exact-SHA smoke, boundary, and output verification.

No database schema change is introduced by PR #123. Database rollback and recovery still require separately evidenced backups and restore testing.

## External release blockers

All connector-accessible implementation and verification must be completed before this section is used. These items cannot be inferred from green CI or a deployment badge.

### Processor and privacy evidence

Complete `docs/PROCESSOR_REGISTER.md` with accountable owners, vendors, account/project identifiers, regions, data locations, DPAs, retention, deletion propagation, support access, training use, telemetry, backup exceptions, and counsel/security approval.

### Production launch evidence

Create and validate `ops/production-launch-evidence.json` with:

- named reviewer and review date
- secrets stored in an approved secret manager and rotated for launch
- automatic backups, retention, recent successful backup, tested restore, and runbook
- error tracking, log aggregation, alerting, dashboard, and escalation path
- Stripe live mode, production webhook endpoint, required event subscriptions, and recent webhook test
- approved retention/deletion policy and SLA
- completed legal and compliance review
- approved medical disclaimer
- BAA status of `signed` or `not_required`

Run:

```bash
node scripts/verify-production-launch.mjs \
  --web-url=https://genemap-discovery.vercel.app \
  --api-url=https://genemap-api-production.up.railway.app \
  --evidence=ops/production-launch-evidence.json
```

The result must contain zero failures.

### Owner-authorized authenticated production journey

On the exact deployed release, retain redacted evidence of:

1. sign-in and lesson/progress behavior
2. lesson-to-Gene-Search navigation
3. a source-checkable reviewed-reference search
4. complete provenance inspection on GeneCard
5. print and copy artifact inspection
6. Research Mode cohort configuration and bounded hypothesis generation
7. downloaded Markdown inspection, including focus and controls
8. inert generated-link/image behavior
9. sign-out and protected-route rejection
10. fail-closed recovery switch behavior

Do not use personal genomic data for release verification.

## Release decision

**Current decision: `BLOCKED`.**

PR #123 must still pass fresh exact-head CI and review, merge to `main`, pass post-merge CI/review, deploy by exact SHA, and receive live output inspection. After connector-accessible release work is complete, if the only remaining items are the owner-controlled evidence above, the truthful status becomes:

`SOFTWARE COMPLETE, EXTERNAL RELEASE BLOCKER`

It becomes `PRODUCTION READY` only after the processor/privacy, operational, payment, qualified-review, and authenticated-production evidence is completed and verified.