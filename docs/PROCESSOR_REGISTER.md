# Processor and external-service register

Last code-flow review: **2026-08-19**, against release SHA
`3b492e5aae7a12ef4c35cf4a53e9821108b0f57b`.
Previous review: 2026-08-10 (production-ready/genemap-discovery wave).
Scope: public education/early-research build plus legacy data that may still be
stored from earlier releases.

## What is complete and what is not

**The register is COMPLETE as a factual document.** Every third party that
receives data in this build has been enumerated from the code, and every row
below cites the `file:line` that proves the flow. The enumeration was derived by
reading every `fetch(`/SDK callsite under `services/api/src`, `apps/web`,
`apps/desktop` and `packages/shared` and cross-checking each against the
publication boundary — not from assumption or from a vendor list.

**The owner's sign-off is NOT complete, and that is a separate thing.** A
complete factual map is not an executed DPA, a chosen region, a configured
retention setting, a disabled training flag, or a security review. Those are
owner actions on owner accounts; no agent can perform or attest them. Items
marked **not evidenced** below are exactly that: facts the repository cannot
prove. They remain release blockers for any claim that the *review* is complete,
even though the *register* is.

This register records what the repository can prove. A vendor policy or DPA URL
does not prove that Axiom Biolabs has executed the agreement, selected a region,
configured retention, disabled training/logging, or completed a security review.

## The three gates that decide what is reachable

Everything below depends on these, so they are quoted rather than summarised.

**Gate 1 — hard-coded clinical disable.**
`services/api/src/config/publishingBoundary.js:15`:
`export const HIGH_RISK_CLINICAL_FEATURES_ENABLED = false;` — a `const`, not
env-driven. Consumed at `:151` and `:162`.

**Gate 2 — hidden path prefixes return 404.**
`publishingBoundary.js:27-35` freezes `/clinical-trials`, `/genomics/vcf`,
`/genomics/variant`, `/genomics/clinvar`, `/entities/medical-data`,
`/entities/conversations`, `/admin/self-test`. Enforced globally by the
`onRequest` hook at `services/api/src/index.js:122`. Path normalisation is
anti-evasion (double URL-decode + dot-segment collapse, `:60-116`).

**Gate 3 — model-publication kill switch.**
`services/api/src/routes/llm.js:45-47`:
`return source.DISABLE_MODEL_PUBLICATION !== '1';`

**Gate 4 — raw-input rejection on the AI path.** `publishingBoundary.js:180-206`
blocks `agent`, `options.publicationTask`, and any `prompt`/`messages`/
`context`/`topic` on `/llm/*`; `routes/llm.js:124-150` re-checks;
`services/llm.js:118-123` throws on raw VCF/genomic text unless a consent-backed
`allowGenomic` marker is set.

**Build-time bundle enforcement.** `scripts/verify-publication-bundle.mjs:56-79`
fails the build if the shipped `apps/web/dist` contains any hidden path string
or `invokeLLM`. Wired into `pnpm release:check`.

## Contracted infrastructure and processors

| Service | Runtime status and role | Code evidence | Data and triggering flow | Region | Retention, deletion, and export | Contract, security, and subprocessor evidence | Account owner / review status |
|---|---|---|---|---|---|---|---|
| Vercel | Active web host/CDN for the React application | `vercel.json`, `apps/web/vercel.json`; production deployment `dpl_G1uPgw4NaqrHPtwH4hWBRn9jwsac` on project `prj_G9SOCfU1TOokRwm8cDczraPXLEKw` | Request IP/device metadata, requested page/static assets, deployment logs. The API session is served from the API origin, not intentionally submitted to Vercel as application content. | `iad1` for the current production deployment (Vercel API). Project-wide region policy not evidenced in repo | Project/log retention and deletion settings not evidenced | [DPA](https://vercel.com/legal/dpa); subprocessor list referenced from Vercel's security portal. Executed DPA/plan eligibility and BAA status are not evidenced. | Named Axiom owner required; contract/config review pending |
| Railway | Active API and PostgreSQL host; also hosts the closure-ledger service | `railway.json`; `DATABASE_URL` in `PRODUCTION_REQUIRED` (`services/api/src/config/env.js:91`) | Account/profile data, authentication/session data, research content, search history, projects, billing identifiers, operational logs, and encrypted legacy medical/conversation columns that remain in the database | Configured service/database region not evidenced in repo | Live-data, log, backup, export, and deletion settings not evidenced. Do not rely on an assumed provider backup schedule. | [DPA](https://railway.com/legal/dpa); subprocessors at Railway trust portal. Execution, plan applicability, backup settings, and BAA status not evidenced. | Named Axiom owner required; contract/config/backup review pending |
| OpenAI API | Active default text-generation provider | `services/api/src/services/openai.js:60-68`, `:87-95`; client `:8-18`; dispatch `services/llm.js:125-136`, `:247-264`; host constant `services/llm.js:17` | Server-composed prompts only, drawn from a finite grammar: cohort sample counts and enums; server-resolved HPO/MONDO/gene identifiers with canonical labels; up to 5 gene symbols; catalog topic id/title; one of 4 fixed tutor interactions (`publicationTaskContracts.js:472-553`, `routes/education.js:265-277`, `:365-372`). Prefixed by the honesty directive (`services/scientificHonesty.js` via `llm.js:252`). Raw user text is refused by Gate 4. Application error messages and stacks are not sent. | Project processing/residency configuration not evidenced | Project retention controls, abuse-monitoring retention, deletion/export workflow, and opt-in state not evidenced | [DPA](https://openai.com/policies/data-processing-addendum/), [subprocessors](https://openai.com/policies/sub-processor-list/), [API data controls](https://developers.openai.com/api/docs/guides/your-data). Executed DPA and project settings not evidenced. No BAA/clinical authorization evidenced. | Named Axiom owner required; contract and project-setting review pending |
| Anthropic API | Active alternate text-generation provider — **and reachable per request, not only per deployment** | `services/api/src/services/anthropic.js:79-85`, `:129`; client `:41-51`; selection `services/llm.js:11`, `:128-131`; **per-request selection `routes/llm.js:113`** | Same bounded task categories as OpenAI. **Correction to the previous review:** selection is not purely a deployment setting — `routes/llm.js:113` accepts `options.provider` from the caller and allows `'anthropic'`, so a browser client can route a `/llm/invoke` request to Anthropic regardless of `LLM_TEXT_PROVIDER`. The education routes cannot (they pass no `provider`). Only the first system message survives (`anthropic.js:105-118`). Application error messages and stacks are not sent. | Routing/residency configuration not evidenced | Account retention, deletion/export support, and training/logging settings not evidenced | Anthropic [commercial data-handling information](https://privacy.anthropic.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers). Executed DPA, current subprocessor review, and BAA status not evidenced. | Named Axiom owner required; contract and account-setting review pending |
| Stripe | Active billing processor | `routes/billing.js:151`, `:183-186`, `:235`, `:281`; `services/accountClosureState.js:113`; `services/accountClosure.js:152`, `:174`, `:191`, `:234`, `:267`; client `billing.js:11-17` | Checkout: `customer_email` (the account email) or an existing `stripeCustomerId`, a server-env price id, `metadata.userId` (`billing.js:140-148`). Institutional checkout additionally sends `contactEmail`, `organizationName`, `licenseType`, `seats` (`:218-232`). Portal, retrieve, expire, cancel and customer-delete calls send identifiers only. Full card details are handled by Stripe-hosted surfaces. | Account and processing regions not evidenced | Stripe-side customer/subscription deletion, export, tax/legal retention, and webhook replay policy not evidenced | Stripe privacy/DPA and subprocessor review must be attached by the owner. PCI status does not establish GeneMap privacy or clinical readiness. | Named billing/privacy owner required; review pending |
| Independent account-deletion ledger | Required external restore-safety control; **fail-closed in production** | `services/api/src/services/accountClosureLedger.js:273-287` (write), `:325-337` (read); payload `:254-267`; fail-closed `:224-234`; HTTPS-only `:16-24` | Exact payload: `{version, event:'account_deletion_authorized', receiptId, userIdHash (keyed one-way HMAC-SHA256, `:33-38`), identityKeyId, actorMode, authorizedAt, releaseSha, billing:{checkoutSessionsExpired, subscriptionsCancelled}}`. Signed with `x-genemap-ledger-signature` over `timestamp.body`; responses must be signed and fresh within 5 minutes (`:89-108`). Read requests send headers only, empty body. **No raw email, profile, search, research, medical, or genomic content.** In `NODE_ENV=production` a missing ledger makes account deletion throw 503 rather than silently skip. | Operator and region not evidenced. A reference implementation ships at `ops/closure-ledger/`, but nothing in the repo proves that is what is deployed. | Retention must cover every restorable backup plus recovery margin. Deletion, export, immutability, historical key custody, and restore reconciliation drill are not yet evidenced. | Service/vendor, agreement, TLS termination, access control, and durability evidence are not recorded. | Named privacy/backup owner required; production configuration and zero-blocker reconciliation drill pending |
| Redis operator | **ACTIVE in production** (previously listed as conditional) | `services/api/src/config/rateLimitStore.js:109`; wired `:326-333`, `index.js:109`, `:142`; namespaces `:13`, `:330` | Rate-limit counters with TTLs under `genemap-rate-limit-` and `genemap-rate-limit-auth-`, plus the credentials embedded in `REDIS_URL` and connection/health traffic. **Ambiguity kept honest:** no `keyGenerator` is set, so the key suffix comes from the rate-limit plugin's default; that suffix (commonly the client IP) is *inference*, not repository evidence. The one repo-evidenced identity format is the in-memory emergency fallback (`:451`, `requestIdentity` = `request.ip`), which never reaches Redis. | Vendor and region unknown | TTL, persistence, backup, deletion, and export unknown | Repository proves only an `ioredis` connection URL. Vendor, DPA, subprocessor list, and security evidence are missing. | **Escalated:** `GET /readyz` on 3b492e5 returned `rateLimitStore: "redis:ready"`, so this is a live production processor whose operator is unidentified. Deployment owner must identify it before release. |
| Resend | **Dormant — no live callsite** | `services/api/src/services/email.js:31-49`; client `:12-19` | `sendEmail` has zero production import sites; it is referenced only inside `email.js` and in a test. The former caller `services/api/src/services/firstLoginNotifier.js:8-23` no longer emails: it updates `lastLoginAt` and returns `notified: false`. Locked by `apps/web/lib/__tests__/clinicalPublishingBoundary.test.js:354`, which forbids `sendEmail`, `user.email`, `user.fullName` and `FIRST_LOGIN_REPORT_EMAIL` in that file. `EMAIL_FROM` is dead code. | Primary processing described by vendor as US; actual account choices not evidenced | Email/log retention, suppression lists, deletion/export, and log redaction settings not evidenced | [DPA](https://resend.com/legal/dpa), [subprocessors](https://resend.com/legal/subprocessors). Executed DPA and account settings not evidenced. | Named Axiom owner required **before activation**; contract and retention review pending |
| Sentry | **Disabled — no SDK import on either side** | `services/api/src/config/sentry.js` (whole file); `apps/web/lib/sentry.js` (whole file) | Both files are stubs: `initSentry()` returns `false`, `captureException()` is an empty body commented *"Error objects and stacks can contain user text."* Neither imports `@sentry/*`. `middleware/errorHandler.js` contains no `captureException` call. `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` and `VITE_SENTRY_DSN` are read nowhere in source — **setting them has no effect.** Regression-locked by `clinicalPublishingBoundary.test.js:352-359`. **Caveat:** `@sentry/node` and `@sentry/react` remain installed dependencies (`services/api/package.json:29`, `apps/web/package.json:44`); unreferenced, so tree-shaken out of the bundle, but still in the dependency graph and lockfile. | Not applicable while disabled | Not applicable while disabled | [DPA](https://sentry.io/legal/dpa/), [subprocessors](https://sentry.io/legal/subprocessors/). Executed DPA, scrubbing rules, and BAA status not evidenced. | Named Axiom owner required **before activation** |

### Removed since the previous review

`errorReporter` no longer exists. There is no `services/api/src/services/errorReporter.js` in the tree and `ERROR_REPORT_EMAIL` is read nowhere. Its
replacement, `services/api/src/routes/clientError.js`, accepts only two enum
values (`clientError.js:1-2`), logs them, and always returns 204; the browser
sends exactly `JSON.stringify({eventCode, errorClass})`
(`apps/web/lib/reportClientError.js:34`) to the app's own API, not to a third
party. **No owner error emails are sent.**

## External scientific lookup services

These endpoints are used as follow-up scientific sources, not as proof that a
material claim is verified. They are not assumed to be contracted processors.
Requests originate from the API, but the query text or identifier can still be
user-linked inside GeneMap and must be disclosed and minimized.

| Service | Host | Reachable in the publication build? | Callsite | Data sent | Review status |
|---|---|---|---|---|---|
| NLM Clinical Tables (HPO) | `clinicaltables.nlm.nih.gov` | **Yes** — `/genomics/publication-concepts/search` and the `/llm/invoke` resolver | `publicationResolvers.js:6`, used `:134-141`, `:273-279`; routes `publicationConcepts.js:18-26`, `llm.js:174-184` | 2-80 character search text with no CR/LF (`:269`), or an exact `HP:#######` id; fixed response fields/count | Terms, privacy, logging, retention, rate limit, and attribution review pending |
| Monarch Initiative API | `api.monarchinitiative.org` | **Yes** — autocomplete, entity lookup, and `/genomics/association-evidence` | `publicationResolvers.js:7`, `:216`, `:283-284`; `associationEvidence.js:11`, `:592`, `:634-636`, `:661-663`; route `genomics.js:235-238` | 2-80 character search text, exact `MONDO:#######`, or a server-resolved gene id (`HGNC:`/`NCBIGene:`/`ENSG`) | Terms, privacy, logging, retention, versioning, and attribution review pending |
| MyGene.info | `mygene.info` | **Yes** — `/genomics/enrich`, association evidence, and the `/llm/invoke` resolver | `genomicDatabases.js:374`, params `:307`, `:368-373`; `associationEvidence.js:730`; `publicationResolvers.js:91-97` | Form-encoded `q=` with up to 50 gene symbols, `scopes=symbol`, `species=human`, fixed `fields=` | Terms, privacy, logging, retention, versioning, and attribution review pending |
| Open Targets Platform GraphQL API v4 | `api.platform.opentargets.org` | **Yes** — `/genomics/association-evidence` | `associationEvidence.js:12`, POST `:509-517`, query `:493-508`, variable `:467-469` | GraphQL document with variable `diseaseId` = the MONDO id with `:`→`_`. Candidate gene symbols are filtered **locally** (`:544-548`) and are not sent. Returned provider scores decide only whether a source row exists; they are not published or ranked. | Terms, privacy, logging, retention, rate limit, data-release/version, and attribution review pending; production use remains blocked until the owner records the review |
| JAX HPO ontology | `ontology.jax.org` | **Yes — CORRECTION.** The previous review filed this under "disabled legacy integrations". It is live and browser-triggered. | `genomicDatabases.js:283`; called by `validateHpoTerms` `:459`, reached from `POST /genomics/enrich` (`routes/genomics.js:250`, called by `apps/web/components/search/PhenotypeSearchService.jsx:352`) and exposed directly as `GET /genomics/phenotype/search` (`routes/genomics.js:224-229`). Neither path is in `HIDDEN_PATH_PREFIXES` nor in the bundle blocklist. | Normalised, lower-cased, ≤256-character phenotype name strings (`:60-64`), up to 80 per call (`:436`, `:449`). These usually originate from LLM gene output, but the endpoint accepts arbitrary caller text. | **Newly disclosed. Terms, privacy, logging, retention, and attribution review pending — and it must be added to the public disclosure, which currently does not mention it.** |
| Ensembl REST | `rest.ensembl.org` | **Partially — CORRECTION.** Not disabled. `GET /genomics/gene/:symbol` (`routes/genomics.js:208-213`) is mounted, is not a hidden prefix, and is not in the bundle blocklist. The shipped UI never calls it, but any authenticated user can call it directly and cause an Ensembl request. `getGeneSequence` has no route caller. | `genomicDatabases.js:189`, `:212`; also reached from the hidden VCF path (`services/vcf.js:265`) | Lower-cased, ≤256-character gene symbol string | **Owner decision required: either disclose Ensembl as an active processor, or remove/gate the `/genomics/gene/:symbol` route so "disabled" is true.** |

Google Fonts connection hints were removed from `apps/web/index.html`. Verified
this review: the file contains no external `<link>`, `<script>`, `preconnect`,
`dns-prefetch`, or font reference — only same-origin assets. Locked by
`clinicalPublishingBoundary.test.js:274-276`.

## Genuinely gated-off integrations

These have callsites in source but cannot be reached in the publication build,
because every caller sits behind a hidden path prefix (Gate 2):

| Service | Host | Callsite | Only callers |
|---|---|---|---|
| MyVariant.info | `myvariant.info` | `genomicDatabases.js:142`, `:164` | `/genomics/variant/*` (hidden), `services/vcf.js:264` (hidden) |
| NCBI E-utilities / ClinVar | `eutils.ncbi.nlm.nih.gov` | `genomicDatabases.js:237`, `:257` | `/genomics/clinvar/search` (hidden), `services/vcf.js:266`, `:273` (hidden) |
| ClinicalTrials.gov | `clinicaltrials.gov` | `services/clinicalTrials.js:4`, `:112`, `:146` | `/clinical-trials/*` (hidden); also string-banned from the web bundle |

Their mere presence in source is not authorization to call them. They must stay
disabled until scientific identity/provenance gates and a privacy/terms review
are complete.

## Browser, mobile and desktop egress

- **No analytics, tag manager, crash reporter, session replay, or CDN.** A
  repo-wide search across `apps/`, `services/` and `packages/` for
  `googleapis|firebase|onesignal|posthog|mixpanel|segment|google-analytics|gtag|plausible|amplitude|datadog|newrelic|logrocket|fullstory|hotjar|aws-sdk|s3`
  returns only the negative assertion inside the boundary test.
- The service worker caches same-origin only
  (`apps/web/public/service-worker.js:38-40`).
- All external hostnames in `apps/web` are user-clicked anchor `href`s
  (GitHub releases, PubMed, NCBI, UniProt, Ensembl, MedlinePlus, gnomAD,
  axiombiolabs.org), not automatic requests.
- **Android:** the Google Services plugin applies only if
  `google-services.json` exists (`apps/web/android/app/build.gradle:65-70`);
  the file is absent and gitignored, so **FCM/push is not configured**. The
  manifest declares only `android.permission.INTERNET`; no analytics or crash
  SDK. Capacitor plugins are SplashScreen / StatusBar / Keyboard only.
- **Desktop (Electron):** external URLs are handed to `shell.openExternal`
  (`apps/desktop/main.js:44`, `:52`); production loads the bundled
  `../web/dist`. `"publish": null` — no auto-updater and no update server.

**Open finding — there is no Content-Security-Policy.** `vercel.json:17-40` and
`apps/web/vercel.json:7-17` set HSTS, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` but **no
`Content-Security-Policy`**, and the API disables helmet's CSP
(`services/api/src/index.js:74`, `contentSecurityPolicy: false`). Browser egress
is therefore prevented by the *absence* of code, not by enforcement: any future
dependency or snippet that adds an external request would not be blocked at
runtime. The bundle-string check (`verify-publication-bundle.mjs`) catches the
specific banned strings, not arbitrary new hosts.

## Build and CI egress (not runtime processing)

Recorded separately so it is not confused with application data flow:
`.github/workflows/education-sources-linkcheck.yml` reaches `medlineplus.gov`
and `genome.gov` from GitHub Actions; `scripts/monitor-railway-deployment.*` and
`scripts/publish-android-release.*` reach the Railway and GitHub APIs; package
installs reach the npm registry. None of these carry user data.

## Stale documentation that contradicts the code

Found during this review. These are documentation defects, not data flows, but
they will mislead the next reviewer:

- `services/api/.env.example:91-110` still documents `RESEND_API_KEY`,
  `ERROR_REPORT_EMAIL`, `SENTRY_DSN` and `SENTRY_TRACES_SAMPLE_RATE` as
  functional. None of them are read anywhere in source.
- `ops/README.md:46-47` still describes owner error-report emails via
  `errorReporter`, which no longer exists.

## Configuration facts the repository cannot settle

These decide what actually leaves the system and must be read from the live
Railway environment, not from source:

1. Whether `DISABLE_MODEL_PUBLICATION` is `0` or `1` — everything in the OpenAI
   and Anthropic rows is contingent on `0`. (`/readyz` on 3b492e5 reported
   `modelPublication: {enabled: true}`, so it is `0` in production today.)
2. Whether `LLM_TEXT_PROVIDER` is `openai` or `anthropic`. Note this does not
   bound exposure: `routes/llm.js:113` lets a caller pick either.
3. Whether `REDIS_URL` is set, and to whose Redis. (`/readyz` reported
   `rateLimitStore: "redis:ready"`, so it is set; the vendor is still unknown.)
4. The ledger operator's identity, host, region and TLS termination.
5. The exact Redis key suffix and TTL, which come from the rate-limit plugin's
   defaults rather than from this repository.

## Operator and support access

The admin API contains user/support-management routes, so the public policy must
not say that account data is accessible only to the signed-in user. Authorized
operators may access limited data for support, security, deletion, billing, and
legal obligations. Access must be role-restricted, logged, purpose-limited, and
reviewed. The aggregate analytics endpoint is separately constrained to counts
and allowlisted categories; it does not return raw query text, identities,
medical/conversation records, activity metadata, or retired agent content.

## Release checklist — owner sign-off (the part that is NOT complete)

- [ ] Name an accountable owner for every active/conditional service.
- [ ] Identify the Redis vendor or remove `REDIS_URL` from production. **Now
      urgent: Redis is live in production, not merely possible.**
- [ ] Decide the Ensembl question: disclose `rest.ensembl.org` as an active
      processor, or gate/remove `GET /genomics/gene/:symbol`.
- [ ] Add JAX HPO (`ontology.jax.org`) to the public disclosure — it is live and
      browser-triggered and was previously mis-filed as disabled.
- [ ] Identify and contract the independent deletion-ledger operator; record
      region, durability, signed-response behavior, retention, access, and
      deletion policy.
- [ ] Record exact account/project IDs, selected regions, and data locations.
- [ ] Execute or verify applicable DPAs and document plan eligibility.
- [ ] Review each current subprocessor list and subscribe to change notices.
- [ ] Record retention, deletion, export, logging, training, and support-access
      settings.
- [ ] Verify processor deletion propagation with test evidence.
- [ ] Verify backups, logs, email, error telemetry, billing exceptions,
      deletion-ledger key rotation, and restore reconciliation in the deletion
      manifest.
- [ ] Decide whether to add a Content-Security-Policy, given that browser egress
      is currently unenforced.
- [ ] Obtain counsel/security-owner approval for the public policy and data map.
- [ ] Keep HIPAA, BAA, medical-device, clinical-readiness, and similar claims out
      of public copy unless independently evidenced for the exact production
      configuration.

Until every applicable item above is evidenced, report the processor/subprocessor
**review** as incomplete and do not mark the bridge-plan privacy gate complete —
even though the **register itself** is now complete and code-cited.
