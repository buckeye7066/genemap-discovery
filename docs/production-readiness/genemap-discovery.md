# Axiom GeneMap Discovery: Production Readiness Record

**Executor:** ChatGPT  
**Repository:** `buckeye7066/genemap-discovery`  
**Verified default branch:** `main`  
**Current main SHA:** `10b8c7ac4219da1f3072fa62fda51a5656630d65`  
**Web target:** `https://genemap-discovery.vercel.app`  
**API target:** `https://genemap-api-production.up.railway.app`  
**Current phase:** `EXTERNAL EVIDENCE`  
**Current release status:** `BLOCKED`  
**Updated:** 2026-08-18

This file records the software and evidence state. It is not proof that GeneMap is production ready.

## Current checkpoint (2026-08-18)

Stale items in the 2026-08-09 record must not be chased:

- PR **#123** merged 2026-08-09. Do not re-open it as if it were an open blocker.
- Publication typecheck no longer dies on `apps/web/lib/app-params.js` `import.meta.env` (`VITE_API_URL` / `MODE` typed as `{}`). That hole is PR **#155** / `10b8c7ac`.

GeneMap is deployed and still **not Production Ready**.

Remaining before `PRODUCTION READY`:

1. Exact-SHA Vercel web + Railway API deploy proof for current `main`.
2. Owner-authorized authenticated production journey on that SHA (lessons → Gene Search → provenance → Research Mode → recovery).
3. Completed processor/privacy register sign-off (`docs/PROCESSOR_REGISTER.md` owner checklist).
4. `ops/production-launch-evidence.json` (file did not exist on `main` as of this checkpoint) and `node scripts/verify-production-launch.mjs` with zero failures.
5. Fresh post-merge CI/review on the exact release SHA with no unresolved release-blocking finding.

Do not invent processor, backup, Stripe, or BAA evidence. Those are owner-ops.

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

## Release decision

**Current decision: `BLOCKED`.**

Software from PR #123 is on `main`. The publication typecheck hole that rolled back FlexFactor cycles is closed on `10b8c7ac`. GeneMap becomes `PRODUCTION READY` only after exact-SHA dual deploy, processor/privacy sign-off, production-launch evidence, and the authenticated learner-to-research journey are completed and verified.

The 2026-08-09 implementation inventory, adversarial regression list, and verification matrix remain in git history at `99a339ca` / `docs/production-readiness/genemap-discovery.md` before this checkpoint. Do not treat that older header's `MERGING` / open-PR-#123 language as current.
