# Closure-ledger chain anchors

`chain-anchors.jsonl` is the off-platform record of the account-deletion
ledger's hash-chain head. Each line is one observation:

```json
{"capturedAt":"…","headSeq":3,"headHash":"…","records":3,"tombstones":2,"expired":0,"retentionDays":2192}
```

## What it is for

The ledger's chain is **tamper-evident, not tamper-proof**. Anyone with control
of the ledger's Railway volume can delete a record and re-chain everything after
it, producing a log that verifies perfectly against itself. No check that runs
only on the ledger host can catch that.

These anchors live in the GitHub repository instead, which the ledger host
cannot write to. Because each chain hash commits to its predecessor, a rewrite
of *any* record at or before an anchored sequence number changes the hash at
that sequence — so comparing the live ledger against a previously published
anchor detects it.

This makes a rewrite **externally detectable**. It does not make one impossible,
and nothing here should ever be described as immutability.

## Contents

Anchors carry the chain head and counts only — never a receipt id, a
`userIdHash`, or any tombstone content — so publishing them in a repository
discloses nothing about who was deleted.

## Running it

Published automatically by `.github/workflows/ledger-anchor.yml` (daily, and on
demand). Manually:

```bash
export LEDGER_ANCHOR_URL=https://genemap-closure-ledger-production.up.railway.app/tombstones/anchor
export ACCOUNT_CLOSURE_LEDGER_SECRET=…            # the transport HMAC secret
node ops/closure-ledger/anchor.mjs verify          # exits non-zero on tamper
node ops/closure-ledger/anchor.mjs capture         # appends a new anchor
```

Always `verify` before `capture`. Capturing first would anchor an
already-rewritten chain and launder the tamper into the record.

Never rewrite or prune this file. An anchor log that the ledger operator can
edit is not an anchor log.
