# Production Launch Verification

This runbook is a no-go checklist, not proof that production is ready. Use it
only after the publication-remediation and privacy-lifecycle changes are merged
and the exact release SHA has passed every required gate.

`scripts/verify-production-launch.mjs` validates the shape and freshness of a
human-supplied evidence file plus selected live HTTP responses. It does not
query provider consoles, schedulers, backup stores, legal records, or deployment
history. A passing result cannot make an unsupported statement true.

## Current boundary

The repository contains code for:

- production environment validation and live health/readiness probes;
- publication-boundary unit, integration, browser, and built-artifact checks;
- fail-closed encrypted manual backup creation;
- one-shot local privacy maintenance for finite deletion retries and expired
  sessions.

Those controls are not yet operational proof. In particular, the repository
does not prove:

- an automatic backup schedule, retention/expiry, key custody, deletion
  propagation, or a current successful restore drill;
- a production schedule, alert, owner, or run history for
  `pnpm privacy:maintenance`;
- processor deletion propagation or an external restore-tombstone journal;
- approved TTLs for search, activity, support, audit, or other retained data;
- content-scrubbed error tracking, log aggregation, alert routing, or on-call
  escalation;
- provider regions, contracts, retention, subprocessors, or completed
  legal/compliance review;
- coordinated web/API release metadata and a boundary-preserving rollback.

Raw browser error forwarding, owner error emails, and Sentry ingestion are
disabled in the publication remediation. Do not describe them as active or
enable their old configuration without a new data-minimization review and
regression tests.

## Evidence required before launch

Record evidence tied to the exact approved release SHA for all of the following:

1. Production secrets are stored in the intended secret managers and were
   generated or rotated for this release. Do not record secret values.
2. Backups are scheduled, encrypted, retained and expired under an approved
   policy; key custody is documented; and a recent restore drill succeeded.
3. `pnpm privacy:maintenance` runs from an externally evidenced scheduler,
   failures alert an accountable owner, and its run history is retained.
4. Monitoring, logs, alerts, and escalation are configured with reviewed
   content-scrubbing rules.
5. Stripe live prices and the signed webhook endpoint are configured and a
   recent test event succeeded.
6. The data-retention policy, processor register, deletion scope, backup
   behavior, and unresolved external propagation limits have owner approval.
7. Legal/compliance review is recorded. Do not infer HIPAA, BAA, or clinical
   readiness from application code.
8. The web and API report the approved release identity, all negative
   publication-boundary journeys pass, and a boundary-preserving rollback
   artifact has been exercised.

## Create the evidence record

Copy either example and replace every placeholder only with a verified fact:

```bash
cp docs/production-launch-evidence.example.json ops/production-launch-evidence.json
```

The filled file is intentionally git-ignored. Keep links or identifiers for the
underlying provider, scheduler, restore, legal, processor, and deployment
records. Never copy an example value as proof.

## Run the verifier

After loading the real production environment:

```bash
pnpm launch:verify -- \
  --api-url=https://api.example.com \
  --web-url=https://app.example.com \
  --evidence=ops/production-launch-evidence.json
```

`--skip-http` is an evidence-only diagnostic and intentionally cannot approve
launch. CI's `--self-test` proves only that the verifier executes and fails
closed against synthetic fixtures.

## Go / no-go

Launch is no-go unless:

- the exact approved merge SHA, not a synthetic merge or older head, has green
  CI, web tests, browser journeys, artifact scanning, migrations, and security
  checks;
- the full verifier passes against the exact deployed web and API release;
- every evidence item above has an inspectable current record;
- publication-boundary, privacy, scientific, and rollback acceptance is
  independently reviewed; and
- no unresolved high-risk review finding remains.

The present privacy lifecycle covers only three legacy local data categories
(`medicalData`, `aiConversations`, and `searchHistory`) plus expired
sessions. It is material progress, not completion of the privacy, retention,
processor, backup, or restore obligations.
