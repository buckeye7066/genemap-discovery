# Production Launch Verification

Use this runbook after CI is green and before real users are admitted. The goal
is to make the remaining launch caveats explicit, evidenced, and repeatable:
production secrets, backups, monitoring, Stripe live webhooks, data retention,
and legal/compliance review.

## 1. Configure Production Secrets

Store real secrets only in the deployment providers or a secret manager. Do not
commit them to the repository.

Required API runtime values are documented in `services/api/.env.example` and
are enforced by `services/api/src/config/env.js`. In production, the API refuses
to start unless required secrets are present and strong enough.

Minimum launch expectations:

- `NODE_ENV=production`
- `DATABASE_URL` points to production PostgreSQL.
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `COOKIE_SECRET` are newly generated
  random values with at least 32 characters.
- `MEDICAL_DATA_ENCRYPTION_KEY` is a 64-character hex AES-256-GCM key.
- `CORS_ORIGINS` contains only production HTTPS origins.
- `STRIPE_SECRET_KEY` is live-mode and starts with `sk_live_`.
- `STRIPE_WEBHOOK_SECRET` is copied from the live Stripe webhook endpoint.
- At least one LLM provider key is configured, unless LLM features are
  intentionally disabled with `SKIP_LLM_KEY_CHECK=1`.

## 2. Configure Backups

Before launch:

- Enable Railway PostgreSQL automatic backups.
- Set retention to at least 7 days, preferably 30 days.
- Create one manual backup before cutover.
- Restore a recent backup into a non-production database and verify table
  counts and login-critical records.
- Record the backup and restore evidence in `ops/production-launch-evidence.json`.

See `docs/BACKUP.md` for backup and restore procedures.

## 3. Configure Monitoring and Alerting

Before launch, configure:

- Error tracking for API and web runtime exceptions.
- Log aggregation for Railway API logs and Vercel web logs.
- Alerts for API 5xx spikes, `/readyz` failures, database connection failures,
  Stripe webhook failures, high auth error rates, and unusual LLM error/cost
  spikes.
- A dashboard URL and an on-call escalation path.

Record the dashboard URL and escalation path in the launch evidence file.

## 4. Configure Stripe Live Webhooks

In the live Stripe dashboard:

1. Create products and prices for all individual and institutional plans.
2. Configure the webhook endpoint:
   `https://<production-api-host>/billing/webhook`
3. Enable these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the live webhook signing secret to `STRIPE_WEBHOOK_SECRET`.
5. Run a live-mode or Stripe-approved production validation flow and record the
   timestamp in the launch evidence file.

## 5. Approve Retention and Compliance

Review `docs/DATA_RETENTION.md` before launch. The launch evidence must record:

- Data retention policy approval.
- Deletion request SLA.
- Backup retention period.
- Legal and compliance review completion or formal waiver.
- Medical/genomics disclaimer approval.
- BAA status as `signed` or `not_required`.

## 6. Create Launch Evidence

Copy the example evidence file and fill it with production facts. The filled
file is ignored by git because it can contain internal operational details.

```bash
mkdir -p ops
cp docs/production-launch-evidence.example.json ops/production-launch-evidence.json
```

Do not include secrets in the evidence file. It should contain proof that the
secrets exist in the right systems, not the secret values themselves.

## 7. Run the Launch Verifier

Load production environment variables into the shell, then run:

```bash
pnpm launch:verify -- \
  --api-url=https://api.example.com \
  --web-url=https://app.example.com \
  --evidence=ops/production-launch-evidence.json
```

The verifier checks:

- API production env validation through the same `loadEnv()` used at startup.
- Production-only CORS and live Stripe key shape.
- The launch evidence file for backups, monitoring, Stripe events, retention,
  and legal/compliance sign-off.
- `/healthz` and `/readyz`, including `medicalEncryption=true`.
- The deployed web app returns HTML over HTTPS.

For an evidence-only dry run, use `--skip-http`. That mode exits non-zero and
cannot be used as launch approval because it does not prove the live API or web
deployment.

## 8. Go / No-Go Rule

Go only when all of these are true:

- Latest `main` CI is green.
- `pnpm audit --audit-level=low` reports no known vulnerabilities.
- `pnpm launch:verify` exits 0 against production URLs and evidence.
- The backup restore test is complete.
- Legal/compliance ownership has signed or formally waived the applicable
  healthcare/privacy requirements.
