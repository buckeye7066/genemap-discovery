# Production launch verification

`scripts/verify-production-launch.mjs` (run through `pnpm launch:verify`)
checks the shape and freshness of a launch evidence file plus selected live HTTP
responses. It does not query provider consoles and cannot prove that a
self-attested boolean is true.

## How to run

```bash
PRODUCTION_API_URL=https://genemap-api-production.up.railway.app \
PRODUCTION_WEB_URL=https://genemap-discovery.vercel.app \
pnpm launch:verify
```

Copy `production-launch-evidence.example.json` to
`production-launch-evidence.json` and replace every placeholder with a
current evidence reference. The filled file is intentionally git-ignored.
Never copy the example's values as launch proof.

## Current repository state

The following controls exist in code but are not operational evidence:

- production environment validation and live health/readiness checks;
- exact publication-boundary CI, browser, artifact, and negative API tests;
- fail-closed encrypted manual backup tooling;
- a one-shot privacy maintenance worker for finite deletion retries and expired
  sessions.

The repository does **not** currently prove:

- an automatic backup schedule, retention/expiry, key custody, or a current
  successful restore drill;
- a production schedule, alert, or run history for `pnpm privacy:maintenance`;
- external processor deletion propagation or restore-tombstone reconciliation;
- configured content-scrubbed error tracking, log aggregation, alert routing,
  or an on-call escalation;
- provider regions, contracts, retention, subprocessors, or completed
  legal/compliance review;
- coordinated web/API release and boundary-preserving rollback evidence.

Raw client-error forwarding, owner error emails, and Sentry ingestion are
disabled in the publication remediation. Do not set their old configuration
flags or describe them as active without a new privacy review, data minimization
contract, and regression tests.

## Approval rule

A passing verifier means only that the supplied file met the verifier's current
machine-readable contract and that the selected endpoints responded. Launch
approval still requires a reviewer to inspect the underlying provider,
scheduler, restore, processor, legal, and rollback evidence against the exact
release SHA. Keep every unverified example value false or marked `REPLACE`.
