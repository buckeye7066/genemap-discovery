# Axiom GeneMap Discovery: Production Readiness Record

Executor: Cursor
Repository: buckeye7066/genemap-discovery
Verified default branch: main
Current main SHA: 8600e41325513883e9aae702f01eec749f9be114
Web target: https://genemap-discovery.vercel.app
API target: https://genemap-api-production.up.railway.app
Current phase: EXTERNAL EVIDENCE
Current release status: BLOCKED
Updated: 2026-08-19

This file records the software and evidence state. It is not proof that GeneMap is production ready.

## Current checkpoint (2026-08-19 12:14Z)

Closed this session: the restore-independent account-deletion ledger is deployed
and configured. `/readyz` no longer reports `degraded`.

- GET /readyz returned HTTP 200 with `status: "ready"`, `degraded: false`,
  `accountClosureLedger.configured: true`, `currentIdentityKeyId: "2026-08"`,
  `medicalEncryption: true`, `rateLimitStore: redis:ready`, on releaseSha
  8600e41325513883e9aae702f01eec749f9be114.
- The scheduled **Production Smoke** workflow, RED since the ledger check
  landed, is green again: run 32251609141 on 8600e413 completed `success` with
  both jobs passing, including "Check API readiness and publication boundary".
- The ledger is its own Railway service (`genemap-closure-ledger`) with its own
  volume, not a table in the application Postgres. Source: `ops/closure-ledger/`.
- Live protocol drill against the deployed ledger, driven by the real API
  client: signed write accepted and its signed acknowledgement authenticated;
  replay of the same receipt idempotent (record count stayed 1); signed read
  returned a tombstone the client accepted; a conflicting rewrite of the same
  receipt refused; unsigned write and unsigned read both refused with 401; hash
  chain valid. Drill receipt id `drill-2026-08-19-readiness-verification`, whose
  `userIdHash` cannot match any real user.
- Vercel web origin loads. /deployment-version.json is not a GeneMap contract (500).
  Exact Vercel git SHA is not independently confirmed this session.
- ops/production-launch-evidence.json still does not exist on main.

Do not invent processor, backup, Stripe, DPA, or BAA evidence.
Do not treat a same-Postgres tombstone table as the independent deletion ledger.

### Ledger controls: evidenced vs still open

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

Remaining before PRODUCTION READY:

1. ~~Set the four ACCOUNT_CLOSURE_LEDGER_* variables; /readyz must return
   status ready.~~ **DONE 2026-08-19** — verified against the live payload above.
2. Exact-SHA Vercel web proof for current main.
3. Owner-authorized authenticated production journey on that SHA.
4. Completed processor/privacy register sign-off in docs/PROCESSOR_REGISTER.md.
5. Real ops/production-launch-evidence.json with no REPLACE placeholders, and
   verify-production-launch.mjs with zero failures.
6. The ledger controls listed as still open above.
7. Fresh post-merge CI/review on the exact release SHA.

## Release decision

Current decision: BLOCKED.

Production account deletion is no longer 503 on `ACCOUNT_DELETE_LEDGER_UNAVAILABLE`
— the ledger is configured and answered a live signed write and read. The
remaining blockers are items 2-7 above, none of which are the ledger env gap.
