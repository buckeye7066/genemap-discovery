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
`production-launch-evidence.json` and fill in every `REPLACE` value. The real
evidence file is intentionally **git-ignored** — it is a point-in-time launch
record, not source.

## Current state (2026-07-01)

Already verified true for GeneMap (safe to leave as in the example):

- **Env / Stripe** — Railway `genemap-api` has all required prod secrets; Stripe
  is live with the webhook at `/billing/webhook` and all billing events enabled
  (confirmed against the Stripe API).
- **Encryption** — `/readyz` reports `medicalEncryption: true`.
- **Backup restore drill** — a full `pg_dump` → restore into a throwaway
  Postgres 18 container was performed with exact per-table row-count parity; the
  procedure is in `docs/BACKUP.md`.
- **Error alerting** — non-admin runtime errors are analyzed and emailed to the
  owner (`services/api/.../errorReporter`); `POST /report-client-error` is live.
  Optional Sentry activates by setting `SENTRY_DSN` (API) / `VITE_SENTRY_DSN`
  (web).

Owner actions that still require a real answer before flipping to `true`:

- **`backups.automaticBackupsEnabled` + `retentionDays`** — confirm/enable the
  Railway Postgres automated-snapshot schedule and set retention ≥ 7 days
  (dashboard-only setting), then record `lastSuccessfulBackupAt`.
- **`dataRetention.policyDocument`** — author `docs/DATA_RETENTION.md` and set
  `policyApproved` once approved.
- **`legalCompliance.*`** — record the reviewing attorney / compliance owner and
  the review date. `baaStatus` is `not_required` for the consumer-education use
  case; change to `signed` if GeneMap is ever offered to a covered entity that
  requires a Business Associate Agreement.
- **`monitoring.dashboardUrl`** — point at the real Railway project dashboard.
- **`stripe.lastWebhookTestAt`** — send a test event from the Stripe dashboard
  and record the date.
