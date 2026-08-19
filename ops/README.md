# Production launch verification

`scripts/verify-production-launch.mjs` (run via `pnpm launch:verify`) is the
machine-checked launch gate. It validates three things:

1. **Production env shape** — loaded through the real API env validator
   (`services/api/src/config/env.js`): NODE_ENV, HTTPS-only CORS allowlist (no
   wildcard), live Stripe key, webhook secret, and real (non-placeholder) price
   IDs.
2. **Live HTTP health** — `GET /healthz` is `ok`, `GET /readyz` is `ready` with
   `medicalEncryption: true`, and the web app returns HTML.
3. **Human-attested evidence** — a JSON file (default
   `ops/production-launch-evidence.json`) covering backups, monitoring, Stripe,
   data-retention, and legal/compliance sign-off, with freshness windows (e.g. a
   restore must have been tested within 90 days, a Stripe webhook test within 30).

## How to run

```bash
# Full check against production (requires the production env + evidence file):
PRODUCTION_API_URL=https://genemap-api-production.up.railway.app \
PRODUCTION_WEB_URL=https://genemap-discovery.vercel.app \
pnpm launch:verify

# Env + evidence only (no live HTTP; exits non-zero by design):
pnpm launch:verify -- --skip-http
```

Copy `production-launch-evidence.example.json` to
`production-launch-evidence.json` and fill it in. The real evidence file is
intentionally **git-ignored** — it is a point-in-time launch record, not source.

Every boolean in the template starts `false` and every attested string starts
`REPLACE`, on purpose. Flip a value only after you have personally observed the
thing it asserts, in the console or run that proves it. **Do not treat any value
in the template as pre-verified.** Until 2026-08-19 a second, divergent copy of
this template lived at `docs/production-launch-evidence.example.json` fully
pre-attested — legal review, compliance review, restore drill, ledger
reconciliation and Stripe webhook test all set to done — and the launch docs told
you to copy *that* one. Measured against the verifier at its own vintage date it
scored 37 pass / 0 fail on evidence nobody had checked. It has been deleted.

## Historical claims (2026-07-01) — NOT re-verified

The three bullets below were recorded on 2026-07-01 and have **not** been
re-observed since. They are kept as leads, not as evidence, and must not be
copied into an evidence file without a fresh check.

- **Env / Stripe** — Railway `genemap-api` has all required prod secrets; Stripe
  is live with the webhook at `/billing/webhook` and all billing events enabled
  (recorded as confirmed against the Stripe API on 2026-07-01).
- **Encryption** — `/readyz` reports `medicalEncryption: true`. *(This one WAS
  re-observed on 2026-08-19 at release SHA 3b492e5: `/readyz` returned HTTP 200,
  `status: ready`, `degraded: false`, `medicalEncryption: true`.)*
- **Backup restore drill** — a full `pg_dump` → restore into a throwaway
  Postgres 18 container was recorded as performed with exact per-table row-count
  parity; the procedure is in `docs/BACKUP.md`. No dated artifact from that run
  is in the repository, so no `restoreTestedAt` timestamp can be honestly
  recorded from it.
- ~~**Error alerting** — non-admin runtime errors are analyzed and emailed to
  the owner (`services/api/.../errorReporter`); optional Sentry activates by
  setting `SENTRY_DSN` / `VITE_SENTRY_DSN`.~~ **RETRACTED 2026-08-19 — this is
  false at 3b492e5.** `errorReporter` no longer exists in the tree, no owner
  error emails are sent, and both Sentry modules are no-op stubs that import no
  SDK; `SENTRY_DSN` and `VITE_SENTRY_DSN` are read nowhere, so setting them has
  no effect. The only error path is `routes/clientError.js`, which accepts two
  enum values, logs them, and returns 204. **There is no error-tracking,
  log-aggregation or alerting pipeline evidenced**, which is why
  `monitoring.*` is unfilled in the evidence record.

Owner actions that still require a real answer before flipping to `true`:

- **`backups.automaticBackupsEnabled` + `retentionDays`** — confirm/enable the
  Railway Postgres automated-snapshot schedule and set retention ≥ 7 days
  (dashboard-only setting), then record `lastSuccessfulBackupAt`.
- **`dataRetention.policyDocument`** — `docs/DATA_RETENTION.md` exists and is
  reconciled with the implemented deletion/consent behavior; a launch reviewer
  should confirm it matches the business terms, then keep `policyApproved` true.
- **`legalCompliance.*`** — record the reviewing attorney / compliance owner and
  the review date. `baaStatus` is `not_required` for the consumer-education use
  case; change to `signed` if GeneMap is ever offered to a covered entity that
  requires a Business Associate Agreement.
- **`monitoring.dashboardUrl`** — point at the real Railway project dashboard.
- **`stripe.lastWebhookTestAt`** — send a test event from the Stripe dashboard
  and record the date.
