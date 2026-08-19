# Axiom GeneMap Discovery: Production Readiness Record

Executor: Cursor
Repository: buckeye7066/genemap-discovery
Verified default branch: main
Release SHA under evidence: 3b492e5aae7a12ef4c35cf4a53e9821108b0f57b
Web target: https://genemap-discovery.vercel.app
API target: https://genemap-api-production.up.railway.app
Current phase: EXTERNAL EVIDENCE
Current release status: BLOCKED
Updated: 2026-08-19

This file records the software and evidence state. It is not proof that GeneMap
is production ready.

Do not invent processor, backup, Stripe, DPA, or BAA evidence.
Do not treat a same-Postgres tombstone table as the independent deletion ledger.

## Current checkpoint (2026-08-19 13:10Z)

Release SHA under evidence is **3b492e5**, the merge of #161. Items 1, 2 and 7
are now evidenced. Items 3, 4, 5 and 6 remain open, so the release stays
BLOCKED.

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

Recorded limitation: the web bundle embeds no self-reported commit SHA (no
`VITE_COMMIT_SHA` / `releaseSha` anywhere in `apps/web`), so the Vercel
deployment record is the only available exact-SHA proof for the web tier. The
previously noted `/deployment-version.json` 500 is not a GeneMap contract and is
not evidence either way. The API tier does self-report: `/healthz` and `/readyz`
both returned `releaseSha: 3b492e5aae7a12ef4c35cf4a53e9821108b0f57b`.

### Item 3 — authenticated production journey (OPEN — owner input required)

Diagnosed this session. **No authorized authenticated production path exists
today, and none can be created without the owner.** What was checked:

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

Still open: retention policy and expiry, off-platform immutability (the chain is
tamper-EVIDENT, not tamper-PROOF against someone who controls the volume),
alerting on write failure, and a full quarantined-restore reconciliation drill
run against an actually restored database. Key rotation is implemented and
documented but has not been exercised in production.

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
   alias.
3. Owner-authorized authenticated production journey on that SHA. **OPEN —
   blocked on the four owner inputs listed under item 3.**
4. Completed processor/privacy register in `docs/PROCESSOR_REGISTER.md`.
   **The register is now factually COMPLETE; the owner's sign-off is not.**
   See item 4 above.
5. Real `ops/production-launch-evidence.json` with no REPLACE placeholders, and
   `verify-production-launch.mjs` with zero failures. **OPEN** — a real file now
   exists locally with observed values only; exit code 1 with the failures
   itemized above. The template that feeds it has been de-fabricated.
6. The ledger controls listed as still open above.
7. ~~Fresh post-merge CI/review on the exact release SHA.~~ **DONE 2026-08-19** —
   6 workflows, 19/19 jobs green on 3b492e5; one non-gate scheduled workflow was
   found structurally broken and fixed.

## Release decision

Current decision: **BLOCKED**.

Blocked on items 3, 4 (owner sign-off), 5 and 6. Items 1, 2 and 7 are evidenced.
Item 3 and the sign-off half of item 4 are owner actions; item 5's remaining
failures are owner/console facts plus one check that can only be run truthfully
inside the production runtime; item 6 belongs to the ledger-controls lane.
