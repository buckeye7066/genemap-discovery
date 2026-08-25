# GeneMap Discovery — Project Brief

> **Scope of this document.** It describes the **publishable build** — the artifact
> that actually ships to Vercel and Railway. Capabilities that exist in backend
> code but are switched off for publication are listed in
> [§5 Gated capabilities](#5-gated-capabilities-present-in-code-off-in-the-published-build)
> with the reason, and they are **not** described as product features anywhere
> else in this brief. If you find a capability described here that the build does
> not ship, that is a documentation defect — fix the document, not the boundary.

---

## 1. What the product is

GeneMap Discovery helps learners, scientists, and bioinformatics users move from
a genetics question to a traceable, evidence-aware research hypothesis. It has
three modes:

- **LEARN** — level-appropriate genetics education over a reviewed topic catalog.
- **DISCOVER** — gene, phenotype, disease, HPO/MONDO ontology, and evidence
  exploration against named public sources.
- **RESEARCH** — hypotheses, candidate-gene sets, evidence review, saved
  projects, annotations, and comparisons.

**What it is not.** The publishable product is education and exploratory research
only. It is **not** a diagnostic, medical-record interpretation, pharmacogenomic,
treatment, medication, screening, urgency, or clinical-trial platform. That
boundary is enforced in code, fail-closed, at
`services/api/src/config/publishingBoundary.js`
(`HIGH_RISK_CLINICAL_FEATURES_ENABLED = false`), not merely by convention.

---

## 2. How the publication boundary works

Two ideas carry the whole design.

**Arbitrary prompt text is never an authorization signal.** Public model
execution is authorized only by (a) a *server-owned route* that owns its own task
and accepts nothing but a catalog identifier, or (b) a *versioned structured task
contract* that the client fills in but does not compose. Raw `prompt`,
`messages`, `context`, and `topic` fields are rejected outright
(`hasRawGenerationInput`, `services/api/src/config/publicationTaskContracts.js`).
Prompt prose is composed server-side by `composePublicationPrompt`.

**Excluded surfaces are 404, not hidden links.** A set of hidden path prefixes
(`/clinical-trials`, `/genomics/vcf`, `/genomics/variant`, `/genomics/clinvar`,
`/entities/medical-data`, `/entities/conversations`, `/admin/self-test`) returns
`404 FEATURE_NOT_AVAILABLE` from an `onRequest` hook, before authentication and
before any handler runs.

Both hooks are installed globally on the root Fastify instance, ahead of every
route registration:

```js
fastify.addHook('onRequest', enforceHiddenPathBoundary);   // services/api/src/index.js
fastify.addHook('preHandler', enforcePublishingBoundary);
```

Three further layers sit alongside the boundary:

| Layer | File | What it does |
|---|---|---|
| Genomic guard | `services/api/src/services/genomicGuard.js` | `looksLikeRawGenomicContent` / `assertNoRawGenomicLLM` stop raw genomic content reaching a cloud model without a recorded, current `genomic_llm_upload` v1.0 consent. Fails closed. |
| Scientific honesty | `services/api/src/services/scientificHonesty.js` | Every model call is wrapped so the model must separate established findings from hypotheses and attribute sources. |
| Release gate | `scripts/verify-publication-bundle.mjs` | Fails the build if a forbidden chunk or clinical string reaches the built web bundle (denylist), **and** if any route-bearing chunk ships a page absent from the `apps/web/pages.config.js` route map (allowlist). |

A fourth gate runs on the API side:
`services/api/src/__tests__/routeBoundaryCoverage.test.js` walks
`services/api/src/routes/`, works out which route files can reach a cloud model
through the real import graph, and fails if any path they declare is not
registered with the boundary or explicitly allowlisted with a written reason.

---

## 3. Model-invoking surface (the complete list)

Exactly two route files in the API can reach a cloud model, and both do so
through one choke point (`services/api/src/services/llm.js` →
`anthropic.js` / `openai.js`). Every path they expose:

| Path | Authorization | Notes |
|---|---|---|
| `POST /education/explain` | `ROUTE_OWNED_TASKS` → `genetics_education` | Accepts a catalog topic id only. A genetics keyword in prose is not authorization. |
| `POST /education/quiz` | `ROUTE_OWNED_TASKS` → `genetics_education` | Catalog topic + level + question count. |
| `POST /education/chat` | `CLIENT_TASK_ROUTES` → `genetics_education` | Structured `taskInput` with one of four fixed tutor interactions. No free-text field. |
| `POST /llm/invoke` | `CLIENT_TASK_ROUTES` → `aggregate_genomics_research`, `candidate_gene_research`, `research_hypothesis`, `learning_activity_summary` | The only general generation route. Body keys outside `{publicationTask, taskInput, options}` are rejected. |
| `POST /education/image` | `ROUTE_OWNED_TASKS` (registered) | **Gated — see §5.** Never invokes a model. |
| `POST /llm/chat`, `POST /llm/image` | none | **Gated — see §5.** 403 at the boundary, then `ValidationError`. |

Non-generating education paths (`GET /education/topics`, `GET`/`POST
/education/progress`, `GET /education/entitlements`) are explicitly registered as
non-generating.

---

## 4. What the published build actually does

### 4.1 LEARN

- **Reviewed topic catalog.** `services/api/src/config/educationCatalog.js`,
  version 1 — a frozen set of six categories (DNA Basics, How Genes Work,
  Inheritance, Mutations & Variation, Genomics & Technology, Genetics & Health)
  with four topics each. `resolveEducationTopic()` is the only admission gate; a
  new concept must be reviewed into the catalog before it can be taught.
- **Level-appropriate explanations.** `POST /education/explain`, rendered in
  `apps/web/pages/TopicExplorer.jsx`. Education level comes from
  `apps/web/lib/EducationLevelContext.jsx`.
- **Quizzes with progress.** `POST /education/quiz`, scored client-side, result
  persisted via `POST /education/progress`.
- **Bounded tutor.** Four fixed interactions on `POST /education/chat`. There is
  deliberately no free-text tutor box.
- **Learning path.** `apps/web/pages/LearningPath.jsx` derives a curriculum from
  the catalog plus recorded progress.

### 4.2 DISCOVER

- **Curated concept autocomplete.** `GET /genomics/publication-concepts/search` —
  deterministic HPO/MONDO lookup against NLM Clinical Tables (HPO) and the
  Monarch Initiative (MONDO). The response asserts `modelInvoked: false`; no
  model is involved.
- **Phenotype search.** `GET /genomics/phenotype/search` (HPO, ontology.jax.org).
- **Authoritative gene enrichment.** `POST /genomics/enrich` — resolves symbols
  against MyGene.info (→ Ensembl / NCBI) and validates phenotype names against
  HPO. Its stated purpose is to *replace* model-guessed identifiers and
  coordinates with retrieved records. Fails soft: unresolved stays `null` /
  `unverified` rather than being invented.
- **Association evidence.** `POST /genomics/association-evidence` — a bounded,
  source-labelled adapter over a strict discriminated union (HPO / MONDO /
  curated), max 15 symbols. Numeric provider scores are deliberately **absent**
  from the browser contract; candidate symbols remain labelled research leads
  until this adapter returns a complete source-labelled tuple.
- **Candidate-gene search.** `apps/web/components/search/PhenotypeSearchService.jsx`
  drives `POST /llm/invoke` with the `candidate_gene_research` task, then
  enriches the result through `/genomics/enrich` so identifiers come from a named
  source rather than the model.
- **Search history and saved gene sets.** `POST/GET/DELETE
  /entities/search-history`, `/entities/gene-sets`.

Free-typed queries that do not resolve to a reviewed concept or an exact
`HP:` / `MONDO:` identifier are refused with a message asking the user to choose
a reviewed term. This is intentional: it is what keeps a search traceable.

### 4.3 RESEARCH

- **Hypothesis generation.** `apps/web/components/research/HypothesisGenerator.jsx`
  → `POST /llm/invoke` with the `research_hypothesis` task. Inputs are a
  structured cohort description (sample count, classification, controls),
  modalities, and an objective drawn from fixed vocabularies — not prose.
  Output is markdown, downloadable. **It is not persisted** (see §6).
- **Local sequence workbench.** `apps/web/components/research/SequenceWorkbench.jsx`
  computes entirely in the browser (`apps/web/lib/sequenceAnalysis.js`). It makes
  **no** API call and uploads nothing. It is labelled "Local" in the UI.
- **Projects, versions, annotations, collaborators.** Backed by
  `services/api/src/routes/entities.js`. The API is implemented; the Research
  Mode UI currently mismatches its field contract — see §6, Known gaps.
- **Dashboard activity summary.** `POST /llm/invoke` with
  `learning_activity_summary`, only when there is recent activity.

### 4.4 Account, privacy, and billing

- JWT access/refresh tokens in HTTP-only cookies, CSRF cookie, RBAC, rate limits.
- **Consent records.** `POST/GET /entities/consent`. The genomic-guard consent
  (`genomic_llm_upload` v1.0) always reads the *latest* record, so a revocation
  supersedes an earlier grant.
- **Account closure.** `POST /account/delete` — requires email, password, and a
  literal confirmation phrase; holds a closure lock; super-admin accounts are
  refused. A post-billing failure returns `503
  ACCOUNT_DELETE_FINALIZE_RECOVERY_REQUIRED` with a receipt id rather than
  reporting a success it did not achieve.
- **Limited self-service purge.** `POST /entities/data-deletion-request` deletes
  medical-data, AI-conversation, and search-history rows in one transaction. It
  is explicitly *not* account closure and *not* processor/backup deletion.
- **Billing.** Individual and institutional Stripe checkout, customer portal, and
  a signature-verified idempotent webhook. Price IDs come from server env only;
  client-supplied price IDs are never trusted. Institutional seat assignment is
  TOCTOU-safe.

---

## 5. Gated capabilities (present in code, OFF in the published build)

These exist in the repository. **None of them is a product feature of the
publishable build.** Do not re-enable a route because backend code exists.

| Capability | Where the code lives | How it is gated | Reason |
|---|---|---|---|
| VCF parse / enrich / cohort enrich | `services/api/src/services/vcf.js`, `routes/genomics.js` | `/genomics/vcf/*` is a hidden prefix → `404 FEATURE_NOT_AVAILABLE` before auth | Sequence/VCF analysis is deferred (**Gate A**). It stays out of the publishable product. |
| Single-variant and variant search lookup | `routes/genomics.js`, `services/genomicDatabases.js` | `/genomics/variant/*` hidden → 404 | Personal-variant interpretation is clinical-adjacent; deferred with Gate A. |
| ClinVar search | `routes/genomics.js` | `/genomics/clinvar/*` hidden → 404 | Same. Clinical significance lookup is not an education/research feature here. |
| Medical-data entities | `routes/entities.js`, `middleware/accessLog.js` | `/entities/medical-data` hidden → 404 | Medical-record interpretation is outside the product boundary. Access logging exists but never fires in this build. |
| Stored AI conversations | `routes/entities.js` | `/entities/conversations` hidden → 404 | Same boundary. |
| Clinical-trial search | `routes/clinicalTrials.js`, `services/clinicalTrials.js` | `/clinical-trials` hidden → 404 | Trial matching is explicitly outside the product boundary. |
| Gene metadata lookup | `routes/genomics.js` `GET /genomics/gene/:symbol` | Handler returns `NotFoundError` unless `GENOMICS_GENE_LOOKUP_ENABLED === 'true'` | Deployment-level switch; **off** in the published deployment. |
| Education image generation | `routes/education.js` `POST /education/image` | Handler always returns an `unavailable` publication artifact with `reasonCode: 'image_output_verification_unavailable'` | There is no way to verify that a generated image is scientifically accurate. Until there is, it returns unavailable rather than a plausible-looking picture. |
| Free-form LLM chat / image | `routes/llm.js` `POST /llm/chat`, `POST /llm/image` | 403 at the boundary (`isUnknownGenerationRoute`), then `ValidationError` in the handler | Arbitrary prompt text is never an authorization signal. |
| GSEA / pathway enrichment | `apps/web/components/gsea/GeneSetInput.jsx`, `EnrichmentResults.jsx` (orphaned; no importer, no route, no API caller) | Route absent from `pages.config.js`; chunk name on the bundle-verifier denylist | Deferred (**Gate B**). `EnrichmentResults.jsx` renders p-value and FDR columns; **there is no pathway-enrichment computation anywhere in the API** — no KEGG, Reactome, or GO retrieval exists server-side. Shipping it would present fabricated statistics as if computed. |
| Clinical/persona pages | *removed from disk* — `MedicalData`, `VCFAnalysis`, `AIAssistants`, `Anastasia`, `RobertClinical`, `VisualizationHub` | No source file exists; names remain on the bundle-verifier denylist and in regression tests | Personalized clinical execution and LLM-generated coordinates / expression values / interactions presented as database-derived. |

---

## 6. Known gaps in the shipped surface

Recorded so that no one reads §4 as a claim that every control works.

- **Research Mode → Projects is not usable end to end.** The UI posts `name`
  where the API requires `title`, posts `user_email` where the API requires
  `userEmail`, reads `.annotations` off an already-unwrapped array, and restores
  a version from a `snapshot_data` field the API never stores. Project creation
  and collaborator invitation return 400 today.
- **LearningPath's "Continue to Research" drops its context.** It emits `?q=`;
  `Search.jsx` reads `?query=`.
- **Profile's education-level options exceed the education system's vocabulary.**
  Choosing PhD / Medical / Research Scientist saves a value
  `EducationLevelContext` does not recognize, so the level picker re-prompts.
- **Dashboard "Saved Gene Sets" tiles link to Search with no set identifier.**
- **Hypothesis results are not persisted** — download only.
- **No data export / portability endpoint exists.** Retention is documented in
  `docs/DATA_RETENTION.md` but is not enforced by any scheduled job.
- **Live end-to-end user journey is unverified.** See `READINESS-TABLE.md` §4,
  which marks it PARTIAL and says so plainly.
- **Retention and deletion evidence is incomplete.** `docs/PROCESSOR_REGISTER.md`
  records that Railway live-data, log, backup, export, and deletion settings are
  not evidenced; the closure ledger records that deletion, export, immutability,
  historical key custody, and restore reconciliation are not yet evidenced.

---

## 7. Architecture

```
apps/web          React 18 + Vite + Tailwind + Radix — learn / discover / research UI
apps/desktop      Electron shell that loads the built web app
services/api      Fastify 5 + Prisma 6 + PostgreSQL 18 — education, publication tasks,
                  ontology/gene retrieval, projects, billing
packages/shared   TypeScript — ApiClient, schemas, publication-status contracts
```

Web deploys to Vercel; the API deploys to Railway as a Docker image with a
Railway PostgreSQL database. The desktop shell is packaged separately and is not
part of the cloud deploy.

### Reachable genomics/ontology API surface

| Route | Purpose |
|---|---|
| `GET /genomics/publication-concepts/search` | Deterministic curated HPO/MONDO concept search. No model. |
| `GET /genomics/phenotype/search` | HPO phenotype search. |
| `POST /genomics/enrich` | Gene symbol → MyGene.info/Ensembl/NCBI records; HPO term validation. Fails soft. |
| `POST /genomics/association-evidence` | Source-labelled gene↔phenotype/disease association tuples. |

Everything else under `/genomics` is gated — see §5.

### External sources used by the published build

NLM Clinical Tables (HPO), Monarch Initiative (MONDO), ontology.jax.org (HPO),
MyGene.info, Ensembl REST, NCBI E-utilities. Retrieval provenance is attached to
results; identifiers resolved by a model are replaced with retrieved records
before display.

---

## 8. Testing and release gate

```bash
pnpm lint
pnpm typecheck
pnpm test                 # all workspaces
pnpm test:api             # vitest, services/api
pnpm test:api:integration # requires PostgreSQL
pnpm --filter @genemap/web e2e   # Playwright
pnpm release:check        # full gate, includes verify-publication-bundle
```

`pnpm release:check` is the gate that must pass before publication. It builds the
web bundle and runs `scripts/verify-publication-bundle.mjs`, which fails the
build — naming the offending chunk — if a forbidden chunk or clinical string
appears, or if a route-bearing chunk ships a page that is not in the
`pages.config.js` route map.

Test counts are deliberately not quoted here; a number in a document goes stale
silently. Run the suite for the current figure.
