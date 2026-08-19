# Axiom GeneMap Discovery: Production Readiness Record

Executor: Cursor (ledger controls pass 2026-08-19: claude-code-gm-ledger)
Repository: buckeye7066/genemap-discovery
Verified default branch: main
Release SHA under evidence: 3b492e5aae7a12ef4c35cf4a53e9821108b0f57b
Current main SHA: fc44aaff567615eb7a08481c82e880ddf38842aa (docs-only child of 3b492e5)
Web target: https://genemap-discovery.vercel.app — **DOWN, HTTP 402**
API target: https://genemap-api-production.up.railway.app — up, on fc44aaf
Current phase: EXTERNAL EVIDENCE
Current release status: BLOCKED
Updated: 2026-08-19

This file records the software and evidence state. It is not proof that GeneMap
is production ready.

Do not invent processor, backup, Stripe, DPA, or BAA evidence.
Do not treat a same-Postgres tombstone table as the independent deletion ledger.

## CORRECTION — the web tier went down mid-session (2026-08-19 ~13:18Z)

**An earlier statement in this file, merged in #163, is now wrong and is
retracted first.** It said of the Vercel account block: *"It does not invalidate
item 2 … The web tier is up and is on the release SHA."* That was true when
observed at ~13:00Z. It is no longer true.

**The GeneMap production web app is DOWN.** Measured:

| Time (2026-08-19) | `GET https://genemap-discovery.vercel.app/` |
|---|---|
| ~13:00Z | HTTP **200**, `text/html; charset=utf-8` |
| 13:18Z | HTTP **402** — scheduled Production Smoke run `32257273854` failed here |
| ~13:43Z | HTTP **402**, `text/plain`, body `Payment required` / `DEPLOYMENT_DISABLED` |

The account block does not merely stop new builds — it **disables serving**. The
Vercel API still reports the deployment as `READY`; the edge returns 402 anyway.

**Scope is account-wide, not GeneMap-specific.** Also 402 at the same moment:
`https://www.axiombiolabs.org` (the GrantFlow production domain),
`https://genemap-discovery-buckeye7066-7954s-projects.vercel.app`, and
`https://genemap-discovery-git-main-buckeye7066-7954s-projects.vercel.app`. Every
frontend on Vercel team `team_jGpfNWYX8m7JqvQ33uIeWZsi` is affected.

**Railway is unaffected.** `GET /healthz` returned HTTP 200 with
`releaseSha: fc44aaff567615eb7a08481c82e880ddf38842aa` — the API followed `main`
through the merge exactly as designed. So the two tiers have now visibly
diverged: API on `fc44aaf`, web serving nothing at all.

**This is an owner action.** Unblocking a Vercel account is a billing/account
matter; no agent can clear it. Until it is cleared:

- Item 2's exact-SHA equality is **historical**, valid as of ~13:00Z on 3b492e5,
  and cannot be re-observed while the origin returns 402.
- Item 3 (authenticated production journey) is **doubly blocked** — there is no
  web app to run a journey against.
- Any claim that a Vercel-hosted GeneMap surface works must be treated as false
  until re-probed.

## Checkpoint (2026-08-19 13:10Z)

Release SHA under evidence is **3b492e5**, the merge of #161. Items 1, 2 and 7
are evidenced *as observed at that time*; read them against the correction
above. Items 3, 4, 5 and 6 remain open, so the release stays BLOCKED.

### Item 1 — ledger configured (CLOSED, previous session)

GET /readyz returned HTTP 200 with `status: "ready"`, `degraded: false`,
`accountClosureLedger.configured: true`, `currentIdentityKeyId: "2026-08"`,
`medicalEncryption: true`, `rateLimitStore: redis:ready`. Re-confirmed this
session on 3b492e5 (see item 5 below). The ledger is its own Railway service
(`genemap-closure-ledger`) with its own volume, not a table in the application
Postgres. Source: `ops/closure-ledger/`.

A live protocol drill against the deployed ledger, driven by the real API
client, showed: signed write accepted and its signed acknowledgement
authenticated; replay of the same receipt idempotent; signed read returned a
tombstone the client accepted; a conflicting rewrite of the same receipt
refused; unsigned write and unsigned read both refused with 401; hash chain
valid. Drill receipt id `drill-2026-08-19-readiness-verification`, whose
`userIdHash` cannot match any real user.

### Item 2 — exact-SHA Vercel web proof (CLOSED 2026-08-19)

Read from the Vercel API (`list_projects`, `list_deployments`,
`get_deployment` against team `team_jGpfNWYX8m7JqvQ33uIeWZsi`):

| Field | Value |
|---|---|
| Project | `genemap-discovery` (`prj_G9SOCfU1TOokRwm8cDczraPXLEKw`) |
| Deployment id | `dpl_G1uPgw4NaqrHPtwH4hWBRn9jwsac` |
| Deployment URL | `genemap-discovery-qfvjfmraq-buckeye7066-7954s-projects.vercel.app` |
| `meta.githubCommitSha` | `3b492e5aae7a12ef4c35cf4a53e9821108b0f57b` |
| `meta.githubCommitRef` | `main` |
| `meta.githubCommitVerification` | `verified` |
| `target` / `state` / `readyState` | `production` / `READY` / `READY` |
| `aliasError` | `null` |
| `alias` | `genemap-discovery.vercel.app`, `genemap-discovery-buckeye7066-7954s-projects.vercel.app`, `genemap-discovery-git-main-buckeye7066-7954s-projects.vercel.app` |
| Region | `iad1` |

**Production EQUALS main.** `git rev-parse origin/main` returned
`3b492e5aae7a12ef4c35cf4a53e9821108b0f57b`, byte-identical to the deployment's
`meta.githubCommitSha`. The production alias `genemap-discovery.vercel.app` is
held by that exact deployment with no alias error, and
`GET https://genemap-discovery.vercel.app/` returned HTTP 200
`text/html; charset=utf-8`. Nothing was redeployed to reach this state.

**New blocker found while proving this — the Vercel account cannot deploy.**
The `Vercel` check on PR #163 reported **`fail — "Account is blocked."`**,
linking to `vercel.com/knowledge/why-is-my-account-deployment-blocked`.
Corroborated: `list_deployments` for the project returns **zero** deployments
created after `1787142700000` (2026-08-19 ~12:31Z), even though a branch was
pushed at ~13:2xZ — Vercel accepted the webhook and refused to build.

What this meant at the time of writing, and what actually happened:

- At ~13:00Z it did **not** invalidate item 2: the deployment serving production
  was `dpl_G1uPgw4NaqrHPtwH4hWBRn9jwsac` at 3b492e5, `get_project` confirmed it
  as `latestDeployment` with `readyState: READY, target: production`, and
  `GET https://genemap-discovery.vercel.app/` returned HTTP 200 HTML.
- **That did not hold.** By 13:18Z the same origin returned HTTP 402
  `DEPLOYMENT_DISABLED`. The block disables serving, not only building. See the
  CORRECTION section at the top of this file — it supersedes the optimistic
  reading below, which was written before the origin went down.
- It also means the next merge to `main` cannot reach the web tier. The API
  redeploys via Railway (confirmed: it is now on `fc44aaf`); the web is serving
  nothing.
- **Owner action required.** Unblocking a Vercel account is a billing/account
  matter on the owner's Vercel account; no agent can clear it.

Recorded limitation: the web bundle embeds no self-reported commit SHA (no
`VITE_COMMIT_SHA` / `releaseSha` anywhere in `apps/web`), so the Vercel
deployment record is the only available exact-SHA proof for the web tier. The
previously noted `/deployment-version.json` 500 is not a GeneMap contract and is
not evidence either way. The API tier does self-report: `/healthz` and `/readyz`
both returned `releaseSha: 3b492e5aae7a12ef4c35cf4a53e9821108b0f57b`.

### Item 3 — authenticated production journey (API tier EVIDENCED; web tier still blocked)

**Status changed 2026-08-19.** The ledger-controls lane obtained owner-supplied
credentials and ran an authenticated journey against the live **API** on
releaseSha `3b492e5aae7a12ef4c35cf4a53e9821108b0f57b`. Reported by that lane:
`POST /auth/login` 200 as `super_admin` with httpOnly cookies, `GET /auth/me`
200, `GET /auth/me` with no cookie 401, `GET /genomics/gene/BRCA1` 200 returning
real Ensembl data, the same endpoint unauthenticated 401, and `/readyz`
reporting that exact releaseSha with `status: ready`, `degraded: false`. Also
noted there: `POST /auth/logout` returns 403 without an `x-csrf-token` because
`index.js` registers `requireCsrf` as a global preHandler — correct behaviour,
not a defect.

**Attribution, kept honest.** This record's author did not observe the
authenticated half; those steps required credentials this lane does not hold and
are recorded **as reported by the ledger-controls lane**, not as independently
verified. What this lane *did* verify directly, needing no credentials, against
the live API at main `abf2e47`:

| Probe | Result |
|---|---|
| `GET /auth/me` with no cookie | HTTP **401** |
| `GET /genomics/gene/BRCA1` unauthenticated | HTTP **401** `{"error":"Authentication required"}` |
| `GET /genomics/variant/search?q=BRCA1` | HTTP **404** `FEATURE_NOT_AVAILABLE`, `publicationMode: education_research` |
| `GET /readyz` | HTTP 200, `status: ready`, `degraded: false` |

Those independently confirm the auth gate is real, the publication boundary is
live in production, and — corroborating the register — that
`GET /genomics/gene/:symbol` is genuinely mounted and merely auth-gated rather
than disabled.

**Why this item is not fully closed.** The gate asks for an authenticated
*production journey*. An API-level journey is real evidence and the strongest
available today, but it is not a user completing a task in the product: it
exercises no routing, no `DemographicCheck` redirect, no rendering, no client
session handling. The browser half cannot be run at all right now because
`https://genemap-discovery.vercel.app` returns HTTP 402 (see the CORRECTION at
the top of this file). **Remaining for item 3: clear the Vercel block, then run
the same identity through the web app end to end.**

The diagnosis below stands as the map of what automation exists and what the
owner would still need to supply to make that browser journey repeatable in CI
rather than a one-off manual run:

- **EVA.** There is no EVA config in this repo. The manifest lives at
  `C:\Users\firer\GrantFlow\qa\manifests\genemap-discovery.json` and is
  structurally barred from production: `test_target: "disposable-local-instance"`,
  `base_url: "http://localhost:5173"`, `allowlist.hosts:
  ["localhost","127.0.0.1","::1"]`. All three journeys are logged-out;
  `feature_coverage` is 2 of 6, and every unautomated feature gives the same
  reason — "requires authenticated session with seeded user".
- **Playwright.** `apps/web/playwright.config.js` already defaults `baseURL` to
  `https://genemap-discovery.vercel.app`, but all three specs are logged-out.
  `apps/web/tests/e2e/publication-boundary.spec.js` looks authenticated and is
  not: it injects a synthetic identity and intercepts every XHR so that "no
  unrecognized API call may reach a real environment".
- **Seeded identity.** None. No `prisma/seed.*`, no `seed` script, and
  `scripts/grant-admin.js` (referenced by `auth.js:276`) does not exist in the
  tree. There is no production test identity in code or config.
- **Production Smoke workflow.** It does hit production, and it references
  **zero** GitHub secrets — it is logged-out by construction.
- **Auth gates.** `POST /register` needs no email verification, no invite and no
  Stripe; it self-grants a 7-day trial and signs the user in immediately. So the
  blocker is not a technical gate — it is that registering against production
  writes a real row to the production database, fires the owner first-sign-in
  email, and lands in the account-closure ledger. That is a production mutation
  and needs the owner's consent, not an agent's judgement.

**To unblock in one step, the owner must supply all four of:**

1. **An identity** — either credentials for an existing production user, or
   explicit authorization to self-register a throwaway account against
   production (accepting the real DB row, owner email, and ledger entry). Also
   confirm `LOGIN_MAINTENANCE` is not `1` on Railway, which would 503 both
   register and login.
2. **A credential channel** — two GitHub Actions secret names of the owner's
   choosing (e.g. `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`). No such names exist
   in any spec, config or workflow yet.
3. **The journey definition** — proposed: `/Login` → sign in → clear the
   `DemographicCheck` redirect (`apps/web/components/DemographicCheck.jsx`
   forces any authenticated user with falsy `demographics_collected` to
   `/DemographicCollection` before anything else renders) → education dashboard
   → open a topic → verify progress persists across reload → logout. The owner
   must also say whether an LLM-backed education path (quiz/explain, which
   spends real Anthropic/OpenAI budget) is in scope.
4. **The proof standard** — proposed: a Playwright run with
   `PLAYWRIGHT_BASE_URL=https://genemap-discovery.vercel.app` producing a
   trace/video artifact, plus an authenticated `GET /auth/me` from
   `https://genemap-api-production.up.railway.app` returning that user's real id.

If EVA is to be the runner instead of Playwright, the owner must additionally
edit the manifest to add the production hosts to `allowlist.hosts` and move
`base_url`/`test_target` off the disposable-local-instance contract — and note
the EVA web adapter has no credential interpolation, so a password would sit in
plaintext in that manifest unless a substitution mechanism is added first.

### Item 4 — processor / privacy register (register COMPLETE; owner sign-off OPEN)

`docs/PROCESSOR_REGISTER.md` was rebuilt this session from code evidence, not
from assumption: every `fetch(`/SDK callsite under `services/api/src`,
`apps/web`, `apps/desktop` and `packages/shared` was read and cross-checked
against the publication boundary, and every row now cites the `file:line` that
proves the flow. The register is **complete as a factual document**. The
owner's sign-off is **not**, and the doc now states that distinction explicitly
rather than blurring the two.

Four material corrections to the previous (2026-08-10) register:

1. **JAX HPO (`ontology.jax.org`) is LIVE, not disabled.** It was filed under
   "disabled legacy integrations". It is reached from `POST /genomics/enrich`
   (`genomicDatabases.js:283` ← `validateHpoTerms:459` ← `routes/genomics.js:250`)
   which the shipped UI calls (`PhenotypeSearchService.jsx:352`), and is also
   exposed directly as `GET /genomics/phenotype/search`. Neither path is a
   hidden prefix. It is an undisclosed active processor.
2. **Ensembl (`rest.ensembl.org`) is only partially gated.**
   `GET /genomics/gene/:symbol` (`routes/genomics.js:208-213`) is mounted, is
   not a hidden prefix, and is not in the bundle blocklist. The UI never calls
   it, but any authenticated user can. Owner decision needed: disclose it or
   gate it.
3. **Anthropic is caller-selectable, not deployment-only.**
   `routes/llm.js:113` accepts `options.provider` and allows `'anthropic'`, so
   a browser client can route `/llm/invoke` to Anthropic regardless of
   `LLM_TEXT_PROVIDER`.
4. **Redis is ACTIVE in production, not conditional.** `/readyz` on 3b492e5
   returned `rateLimitStore: "redis:ready"`. A live production processor whose
   vendor is unidentified is a sharper blocker than a hypothetical one.

Confirmed with proof rather than asserted: Sentry is genuinely inert on both
sides (`services/api/src/config/sentry.js` and `apps/web/lib/sentry.js` are
stubs returning `false`, neither imports `@sentry/*`, and `SENTRY_DSN` /
`VITE_SENTRY_DSN` are read nowhere — setting them does nothing); Resend has zero
live callsites; `errorReporter` no longer exists at all, so no owner error
emails are sent; `apps/web/index.html` contacts no external host; there is no
analytics, tag manager, session replay or CDN anywhere; Android has no
`google-services.json` so FCM/push is unconfigured; Electron has no
auto-updater.

New open finding recorded in the register: **there is no Content-Security-Policy
anywhere.** The Vercel headers set HSTS/nosniff/frame-options/referrer/permissions
but no CSP, and the API sets helmet `contentSecurityPolicy: false`
(`services/api/src/index.js:74`). Browser egress is prevented by the absence of
code, not by enforcement.

Also recorded: `services/api/.env.example:91-110` and `ops/README.md:46-47`
still document `RESEND_API_KEY`, `ERROR_REPORT_EMAIL`, `SENTRY_DSN` and the
`errorReporter` owner emails as functional. They are not. Those files sit in
another agent's lane this session and were left untouched; they are flagged for
correction.

### Item 5 — ops/production-launch-evidence.json (OPEN, but the shape of the gap changed)

**The file cannot exist on main.** `.gitignore` lines 39-42 ignore
`ops/production-launch-evidence*.json` and un-ignore only
`ops/production-launch-evidence.example.json`. The filled record is
deliberately a point-in-time operational artifact, not source. "It does not
exist on main" was therefore never the right test; what matters is whether a
real one can be filled and what it fails on.

A real evidence file was created this session at
`ops/production-launch-evidence.json` (git-ignored, so it stays local) with
**only observed values**. Every field that could not be honestly observed was
left `null` with a written reason, rather than filled to make the gate pass.

Command run:

```
node scripts/verify-production-launch.mjs \
  --api-url=https://genemap-api-production.up.railway.app \
  --web-url=https://genemap-discovery.vercel.app \
  --evidence=<abs path>/ops/production-launch-evidence.json
```

**Real exit code: 1.** 16 PASS, 43 FAIL. The failures fall into three groups,
and they are not equivalent:

**(a) Environment section — measures the workstation, not production.** The
verifier calls `loadEnv(process.env)`, so run from a developer machine it
reports the machine: `NODE_ENV must be production, got development`,
`CORS_ORIGINS.http://localhost:5173`, all eight Stripe price IDs "placeholder",
and `accountClosure.ledger` missing. Those are Zod defaults over an empty
environment (`services/api/src/config/env.js:29`, `:300`), not findings about
Railway. Production genuinely has the ledger configured — `/readyz` proves it.
**`pnpm launch:verify` can only produce a truthful env verdict when executed
inside the production runtime.** Until it is run there, the env third of this
gate is UNKNOWN, not failing.

**(b) HTTP section — fully green against production.** `http.apiUrl`,
`http.webUrl`, `http.healthz` (`/healthz` returned status ok), `http.readyz`
(`/readyz` returned ready with `medicalEncryption=true`), `http.web` (web app
returned HTML). 5 of 5 PASS.

**(c) Evidence section — passes exactly what was observed and fails the rest.**
PASS: `evidence.file`, `secrets.storedInSecretManager`, `secrets.manager`,
`backups.restoreRunbook`, `backups.externalDeletionLedgerConfigured`,
`stripe.webhookEndpoint`, `stripe.webhookEndpoint.path`,
`retention.policyDocument`. FAIL, each because the fact was not observed and was
therefore not asserted: `reviewedBy`, `reviewedAt`, `secrets.rotatedForLaunch`,
all five `backups.*` scheduling/drill fields, all five `monitoring.*` fields,
`stripe.liveMode`, all six `stripe.event.*`, `stripe.lastWebhookTestAt`,
`retention.policyApproved`, `retention.deletionRequestSlaDays`,
`retention.backupRetentionDays`, and all six `legalCompliance.*`.

These are owner/console facts — backup scheduling, a restore drill, monitoring
and on-call wiring, the Stripe dashboard, an approved retention policy, and
counsel sign-off. An agent cannot observe them and must not attest them.

**Defect found and fixed while doing this.** `docs/PRODUCTION_LAUNCH.md` told
the operator to `cp docs/production-launch-evidence.example.json
ops/production-launch-evidence.json` — and that file (a second, divergent copy
of the template) shipped **fully pre-attested**: `reviewedBy: "Launch Reviewer"`,
`legalReviewCompleted: true`, `complianceReviewCompleted: true`,
`medicalDisclaimerApproved: true`, `policyApproved: true`,
`automaticBackupsEnabled: true`, `stripe.liveMode: true`, plus concrete
backup, restore, ledger-reconciliation and Stripe-webhook-test dates, and not a
single `REPLACE` marker. Following the documented procedure verbatim produced a
file that would clear the launch gate on entirely invented evidence — the exact
failure this record's hard rule exists to prevent.

Measured, by running the verifier's own `validateEvidence()` against both
templates pinned to the old template's own vintage date (`now =
2026-06-28T00:00:00Z`, so date-freshness is not what separates them):

| Template | Evidence-section result |
|---|---|
| Old `docs/production-launch-evidence.example.json`, as shipped | **37 pass / 0 fail** |
| New `ops/production-launch-evidence.example.json` | **9 pass / 28 fail** |

A copy of the old template cleared the entire evidence gate — legal review,
compliance review, restore drill, ledger reconciliation, Stripe webhook test and
all — with nobody having checked anything. It only fails *today* because those
hard-coded dates have since aged past the freshness windows, which is luck, not
design; anyone refreshing the dates got a green gate on fiction.

Fixed: the divergent duplicate is deleted, both doc references now point at
`ops/production-launch-evidence.example.json`, and that template starts every
attestation `false`/`REPLACE`. Its 9 remaining passes are the structural facts
that are genuinely true of any GeneMap deployment (runbook path, policy-document
path, webhook endpoint and its path shape, secret-manager name); every
attestation now fails until a human consciously asserts it.

**Remaining for item 5:** the owner (or a run inside the production runtime)
must supply the group-(a) and group-(c) values above. This item stays OPEN.

### Item 6 — ledger controls (OPEN, owned by another lane)

Evidenced: operator, both URLs, HTTPS-only transport, transport-secret custody,
identity-key custody separate from the ledger host, authenticated writes, signed
fresh exact-receipt acknowledgements, signed fresh read responses, idempotency,
refusal to overwrite an existing receipt, and append-only hash-chained storage
the process refuses to start against when broken.

Evidenced 2026-08-19 (second ledger pass, this session):

- **Retention policy and expiry.** Tombstones are retained 2192 days (6 years)
  from `recordedAt`; `LEDGER_RETENTION_DAYS` can only lengthen that and a lower
  or unparseable value makes the process refuse to boot. Expiry *appends* a
  retention marker to the same chain and never rewrites or removes the original
  record, so the chain still verifies and the proof of deletion survives; an
  expired receipt still cannot be overwritten. Rationale in
  `docs/DATA_RETENTION.md`. LIVE: `GET /healthz` on the deployed ledger returns
  `{"status":"ok","records":1,"tombstoneCount":1,"expired":0,"retentionDays":2192}`.
  Tests: 4 retention cases in `pnpm test:ledger`. Load-bearing proof — deleting
  the floor check makes the suite fail 1/26 (exit 1); making expiry mutate the
  record in place instead of appending makes it fail 2/26 (exit 1).
- **Off-platform immutability — stated precisely.** The chain remains
  tamper-EVIDENT, not tamper-PROOF; anyone controlling the volume can re-chain
  it into a log that self-verifies. What is now in place is external anchoring:
  `ops/closure-ledger/anchor.mjs` publishes the chain head into
  `ops/closure-ledger/anchors/chain-anchors.jsonl` in this repository — a store
  the ledger host cannot write to — and re-checks the live ledger's hash at every
  previously published sequence before publishing a new one, so a rewrite is
  externally DETECTABLE. `.github/workflows/ledger-anchor.yml` runs it daily and
  on demand. LIVE: two anchors captured from production and verified against it
  (`headSeq 1 / e0c8ecea…` then `headSeq 3 / c47d0d14…`); the seq-1 anchor still
  matched after two further records were appended, which is the append-only
  property observed rather than asserted. Tamper and truncation detection are
  tested against a rewritten log that passes the ledger's OWN chain check;
  removing the hash comparison makes the suite fail 1/26 (exit 1). This is NOT
  immutability — WORM/object-lock storage is still absent.
- **Alerting on write failure.** A failed ledger write now reaches a person:
  `services/api/src/services/operatorAlert.js` always writes a structured
  `[operator-alert]` record to stderr and emails `ADMIN_EMAILS` through the
  repository's existing Resend sender. It never throws, so it cannot mask the
  failure it reports, and it carries no identifying data. `GET /readyz` reports
  `operatorAlert` so an unconfigured mailbox is visible rather than silent.
  NOTE: `services/api/src/config/sentry.js` is an intentional NO-OP in this
  publication build — routing alerts there would have silently dropped them.
  Tests: 6 cases in `services/api/src/__tests__/operatorAlert.test.js`, including
  that `closeUserAccount` emits on a ledger failure and does NOT emit on a
  billing failure or on success; removing the emit fails 1/6 (exit 1).
- **Key rotation exercised in production.** Rotated the `genemap-api` identity
  key ring on 2026-08-19 to `2026-08-19-rot1` (new write key) with `2026-08`
  retained read-only. LIVE on releaseSha 3b492e5: `GET /readyz` returns
  `status: "ready"`, `degraded: false`, `currentIdentityKeyId:
  "2026-08-19-rot1"`, `retiredIdentityKeyCount: 1`. A drill driven by the real
  API client then confirmed a new write recorded under `2026-08-19-rot1`, a
  signed read that still returns and authenticates retired-key-era tombstones
  (including the pre-rotation `drill-2026-08-19-readiness-verification`, key id
  `2026-08`), and `hashIdentityCandidates` resolving one subject against BOTH the
  new-key and the retired-key tombstone. New secret backed up with the rotation
  date to `G:\Backups\genemap-account-closure-ledger-secrets-2026-08-19.txt`.

Still open: a full quarantined-restore reconciliation drill run against an
actually restored database. This is the one ledger control that cannot be closed
from the repository, because it requires restoring a production database backup
into an isolated environment. See "Restore-reconciliation drill" below.

### Item 7 — fresh CI on the exact release SHA (CLOSED 2026-08-19)

Command: `gh run list --branch main --json headSha,conclusion,workflowName,status`,
filtered to `headSha == 3b492e5aae7a12ef4c35cf4a53e9821108b0f57b`, then
`gh run view <id> --json jobs` for job-level conclusions.

Every workflow below is `status: completed` — none was counted while
`in_progress`.

| Workflow | Run | Event | Conclusion | Jobs |
|---|---|---|---|---|
| CI | 32253073297 | push | **success** | 11/11 success |
| Web Tests | 32253073299 | push | **success** | 1/1 success |
| Release language policy | 32253073342 | push | **success** | 1/1 success |
| Railway Deploy Monitor | 32253073325 | push | **success** | 1/1 success |
| Android build and repo-direct release | 32253073858 | push | **success** | 2/2 success |
| Production Smoke | 32254303804 | schedule | **success** | 2/2 success |
| Production Smoke | 32253532454 | workflow_dispatch | **success** | — |
| Education Sources Link Check | 32256036293 | workflow_dispatch | **failure → fixed, see below** | — |

19 of 19 jobs across the six push/schedule workflows succeeded. No job was
skipped-as-green.

**Re-verified on the docs-only child commit `fc44aaf`** (the merge of #163),
which is what `main` now points at. All runs `status: completed`:

| Workflow | Run | Conclusion |
|---|---|---|
| CI | 32258967059 | **success** (11/11 jobs) |
| Web Tests | 32258966665 | **success** |
| Release language policy | 32258967187 | **success** |
| Railway Deploy Monitor | 32258967254 | **success** |
| Education Sources Link Check | 32259111186 | **success** — the fix below, proven |
| Android build and repo-direct release | not run | correctly path-filtered; `android-build.yml` triggers only on `apps/web/**`, `packages/**`, `scripts/**`, lockfile, `package.json`, or its own file — none touched by a docs-only change |

Production Smoke on `fc44aaf` is **not** recorded as green here. Its 13:18Z run
on 3b492e5 (`32257273854`) **failed**, at the step
"Check web security headers", with `curl: (22) The requested URL returned error:
402` against `https://genemap-discovery.vercel.app`. That is the Vercel outage,
not a code regression — and Production Smoke will keep failing on every schedule
until the account is unblocked.

Two workflow files did not run on the release SHA because neither is
push-triggered:

- **`education-sources-linkcheck.yml`** (weekly + manual). Triggered on the
  release SHA this session as run **32256036293**, and it **failed** — but not
  because a link was dead. The job died at module resolution:
  `ERR_MODULE_NOT_FOUND: Cannot find package '@genemap/shared' imported from
  services/api/src/config/educationCatalog.js`. The workflow ran
  `node scripts/check-education-sources.mjs` with **no `pnpm install` and no
  shared build**, so it never probed a single URL. It had been red that way
  since 2026-08-10 — meaning the repo's "source-grounded" promise has gone
  unverified for nine days while a red check made it look tested. Running the
  same script locally with dependencies present: **22 URLs checked, 22 healthy,
  0 unhealthy, exit 0** — the links are fine, the check was broken. The
  workflow now installs and builds `@genemap/shared` before probing.
- **`ios-build.yml`** is `workflow_dispatch` only, deliberately: its own header
  says macOS runners bill at 10x and the unsigned build is only needed on
  demand. It was **not** triggered, to avoid spending owner money on a
  non-gate. Recorded as not-run-by-design rather than silently omitted; say the
  word and it can be dispatched.

## Remaining before PRODUCTION READY

1. ~~Set the four ACCOUNT_CLOSURE_LEDGER_* variables; /readyz must return
   status ready.~~ **DONE 2026-08-19.**
2. ~~Exact-SHA Vercel web proof for current main.~~ **DONE 2026-08-19** —
   production deployment `dpl_G1uPgw4NaqrHPtwH4hWBRn9jwsac` carries
   `githubCommitSha 3b492e5`, equal to `origin/main`, and holds the production
   alias. **But a new blocker was found doing it: the Vercel account is blocked
   for new deployments**, so this equality will break at the next merge. See
   item 2 above — owner action.
3. Owner-authorized authenticated production journey on that SHA. **API tier
   EVIDENCED 2026-08-19** with owner-supplied credentials (login, `/auth/me`,
   an authenticated Ensembl-backed gene read, and their unauthenticated 401
   counterparts). **Web tier still OPEN** — the browser journey cannot be run
   while `genemap-discovery.vercel.app` returns 402. See item 3 above.
4. Completed processor/privacy register in `docs/PROCESSOR_REGISTER.md`.
   **The register is factually COMPLETE and re-derived at main `abf2e47`; the
   owner's sign-off is not.** Delta since the first pass: **Resend is now an
   ACTIVE processor** (operator alerting to `ADMIN_EMAILS` via
   `services/operatorAlert.js`, confirmed live by `/readyz`
   `operatorAlert.configured: true`), so its DPA/owner/retention items moved
   from "before activation" to due now. Sentry remains genuinely inert and must
   **not** be listed as a processor — the installed `@sentry/*` packages and the
   `initSentry` import in `index.js` both refer to a local no-op stub. See
   item 4 above.
5. Real `ops/production-launch-evidence.json` with no REPLACE placeholders, and
   `verify-production-launch.mjs` with zero failures. **OPEN** — a real file now
   exists locally with observed values only; exit code 1 with the failures
   itemized above. The template that feeds it has been de-fabricated.
6. The quarantined-restore reconciliation drill — the LAST remaining ledger
   control. The other four (retention/expiry, off-platform anchoring,
   write-failure alerting, exercised key rotation) were closed 2026-08-19;
   see "Ledger controls: evidenced vs still open" above.
7. ~~Fresh post-merge CI/review on the exact release SHA.~~ **DONE 2026-08-19** —
   6 workflows, 19/19 jobs green on 3b492e5; one non-gate scheduled workflow was
   found structurally broken and fixed.

### Restore-reconciliation drill — what is actually needed

This is genuinely blocked on something the repository cannot supply, so it is
recorded here rather than faked.

`scripts/reconcile-account-closure-ledger.mjs` exists and refuses to run without
a quarantine acknowledgement and a reachable external ledger. What has never
happened is running it against a REAL restored database. To do that requires,
from the owner:

1. a restore of an actual production Postgres backup into a throwaway database
   that no production service points at — the drill is meaningless against a
   synthetic database, because the failure it tests for is a restore
   resurrecting rows the ledger says were deleted;
2. that restored instance kept network-quarantined (no Stripe, no email, no
   outbound integrations) for the duration, per `docs/BACKUP.md`;
3. a `DATABASE_URL` for it plus the ledger transport secret and the full identity
   key ring including every retired key, so tombstones written under `2026-08`
   can still be matched;
4. at least one tombstone in the ledger whose subject actually exists in that
   restored snapshot — otherwise the run proves only that it found nothing.

Point 1 is the blocker: no backup restore has been performed, and backup cadence,
retention, and recoverability are themselves unevidenced (`docs/DATA_RETENTION.md`).
Until an owner performs the restore, this control stays open. Do not record a
synthetic-database run as satisfying it.

## Release decision

Current decision: **BLOCKED**.

Blocked on items 3, 4 (owner sign-off), 5 and 6 — **and now on a live outage:
the Vercel account is blocked and the production web app returns HTTP 402
`DEPLOYMENT_DISABLED`.** That is the most urgent item on this page and it
outranks the rest: there is currently no GeneMap web app for a user, or for
item 3's journey, to reach. It is account-wide (GrantFlow's production domain is
402 too) and only the owner can clear it.

Items 1, 2 and 7 are evidenced as observed — item 2 as of ~13:00Z on 3b492e5,
item 7 on both 3b492e5 and the current `main` at fc44aaf. The API tier is
healthy and tracking `main`.
Item 3 and the sign-off half of item 4 are owner actions; item 5's remaining
failures are owner/console facts plus one check that can only be run truthfully
inside the production runtime; item 6 belongs to the ledger-controls lane.
