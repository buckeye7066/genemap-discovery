# Axiom GeneMap Discovery: Production Readiness Record

Executor: Cursor
Repository: buckeye7066/genemap-discovery
Verified default branch: main
Current main SHA: c0b69ce42f5103b4cea729cafd9f9c37bf98006b
Web target: https://genemap-discovery.vercel.app
API target: https://genemap-api-production.up.railway.app
Current phase: EXTERNAL EVIDENCE
Current release status: BLOCKED
Updated: 2026-08-18

This file records the software and evidence state. It is not proof that GeneMap is production ready.

## Current checkpoint (2026-08-18 20:51Z)

Closed this session (partial): Railway API SHA matches GitHub main.

- GET /healthz returned status ok and releaseSha c0b69ce42f5103b4cea729cafd9f9c37bf98006b
- GET /readyz returned HTTP 200 with status degraded because accountClosureLedger.configured is false (write URL, read URL, secret, and identity keys all unset). medicalEncryption is true. rateLimitStore is redis:ready.
- Vercel web origin loads. /deployment-version.json is not a GeneMap contract (500). Exact Vercel git SHA is not independently confirmed this session.
- ops/production-launch-evidence.json still does not exist on main.

Do not invent processor, backup, Stripe, DPA, or BAA evidence.
Do not treat a same-Postgres tombstone table as the independent deletion ledger.

Remaining before PRODUCTION READY:

1. Owner sets ACCOUNT_CLOSURE_LEDGER_WRITE_URL, ACCOUNT_CLOSURE_LEDGER_READ_URL, 32+ char ACCOUNT_CLOSURE_LEDGER_SECRET, and ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS. Then /readyz must return status ready.
2. Exact-SHA Vercel web proof for current main (API already matches c0b69ce).
3. Owner-authorized authenticated production journey on that SHA.
4. Completed processor/privacy register sign-off in docs/PROCESSOR_REGISTER.md.
5. Real ops/production-launch-evidence.json with no REPLACE placeholders, and verify-production-launch.mjs with zero failures.
6. Fresh post-merge CI/review on the exact release SHA.

## Release decision

Current decision: BLOCKED.

API production is on c0b69ce matching main. Account deletion is 503 in production until the independent ledger env is set.
