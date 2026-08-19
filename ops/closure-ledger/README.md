# Restore-independent account-deletion ledger

`services/api/src/services/accountClosureLedger.js` fails production account
deletion closed unless it can write an HMAC-signed tombstone to an **external**
ledger and read a fresh HMAC-signed acknowledgement back. Until that ledger is
configured, `GET /readyz` reports `status: "degraded"` with
`accountClosureLedger.configured === false`, and the scheduled Production Smoke
workflow fails.

This directory is that ledger's counterparty.

## Why it is a separate deployable

A tombstone table inside the application's own Postgres is **not** a valid
implementation. The restore that resurrects deleted account rows would resurrect
the tombstones' absence with them. `docs/production-readiness/genemap-discovery.md`
states the rule outright: *"Do not treat a same-Postgres tombstone table as the
independent deletion ledger."*

So the ledger is its own Railway service with its own persistent volume. It
shares no database, no process, and no restore path with the API.

## Protocol

Both sides sign `${timestamp}.${body}` with HMAC-SHA256 over the shared
transport secret and send it as `sha256=<hex>`. A response older or newer than
5 minutes is rejected by the client.

| | |
|---|---|
| `POST /tombstones/write` | Signed JSON tombstone in, signed `{"recorded":true,"receiptId":"..."}` out. Idempotent by `receiptId`. |
| `GET /tombstones/read` | Signed request over an EMPTY body, signed `{"tombstones":[...]}` out. Used by `scripts/reconcile-account-closure-ledger.mjs` during a quarantined restore. |
| `GET /tombstones/read?includeExpired=1` | Same, but also returns tombstones already retired by retention. Reconciliation uses the default (live) projection; `includeExpired=1` exists for audit. |
| `GET /tombstones/anchor` | Signed request over an EMPTY body, signed `{headSeq, headHash, records, tombstones, expired, retentionDays, chainValid}` out. `?seq=N` returns `{seq, hash}` for one record. Chain head only — no tombstone content — so it can be published off-platform. |
| `GET /healthz` | Unauthenticated liveness for the platform healthcheck. Reports counts, retention days, and hash-chain validity; never returns tombstone content. |

Requests that are unsigned, mis-signed, stale, or carry a malformed tombstone are
refused. A second write of an existing `receiptId` with a **different** payload is
a `409`, never an overwrite.

## Storage

Append-only JSONL at `$LEDGER_DATA_DIR/tombstones.jsonl`, one record per line:

```json
{"seq":1,"recordedAt":"...","prevHash":"...","hash":"...","tombstone":{...}}
{"seq":2,"recordedAt":"...","prevHash":"...","hash":"...","retention":{"event":"tombstone_retention_expired","receiptId":"...", ...}}
```

Each `hash` covers the previous hash, so any edit to a historical record breaks
the chain. `verifyChain()` runs at boot (the process refuses to start on a broken
chain) and on every `/healthz` probe. Writes are `fsync`ed before the
acknowledgement is sent, because the client treats that acknowledgement as the
point of no return for the deletion.

## Retention and expiry

**Chosen period: 2192 days (6 years) from the moment the tombstone was
recorded, and it can only be lengthened.**

Why that number, and why it can only go up:

- A deletion ledger exists to *prove a deletion happened*. Expiry that destroys
  the proof defeats the control, so the period is set by how long the proof
  might be needed, not by storage cost — and each record is a few hundred bytes
  of pseudonymous data, so there is no cost pressure to shorten it.
- Six years is the evidence period `docs/DATA_RETENTION.md` already contemplates
  for a post-deletion evidence record.
- The binding constraint is backups. A tombstone must outlive every backup that
  could restore the deleted account, or a restore could resurrect an account
  with no tombstone left to reconcile it against — the exact failure this ledger
  exists to prevent. Backup retention and expiry are **not yet evidenced** for
  this project, so the window is unknown; the floor is therefore set well above
  any plausible value.
- `LEDGER_RETENTION_DAYS` may raise the period. A value below the floor is a
  configuration error the process **refuses to boot on**, so retention cannot be
  quietly shortened by an env change.

**What expiry does.** It retires a tombstone from the reconciliation projection
by *appending* a retention marker to the same hash chain. The original
chain-bearing record is never rewritten and never removed — so the chain still
verifies end to end, the proof that the deletion happened survives, and a
re-write of an expired `receiptId` is still refused with `409`. Expired
tombstones drop out of `GET /tombstones/read` and remain visible under
`?includeExpired=1`.

The sweep runs at boot and on every authenticated request: no cron, so there is
no second moving part that can silently stop running.

## Off-platform immutability (anchoring)

The chain is **tamper-evident, not tamper-proof**. Whoever controls the `/data`
volume can delete a record and re-chain everything after it into a log that
verifies perfectly against itself. Nothing that runs on the ledger host can
catch that.

`anchor.mjs` closes the hole from outside: it publishes `(headSeq, headHash)`
into `anchors/chain-anchors.jsonl`, committed to this GitHub repository, which
the ledger host cannot write to. Every run first re-checks the live ledger's
hash at each previously anchored sequence. Because each hash commits to its
predecessor, a rewrite of any record at or before that sequence changes it, and
the check fails.

This makes a rewrite **externally detectable by comparison**. It does not make
one impossible. See `anchors/README.md` and
`.github/workflows/ledger-anchor.yml` (daily + `workflow_dispatch`).

## Alerting on write failure

A failed ledger write means an account the user asked to delete still exists and
the deletion is not recorded — it must reach a person, not just an audit row in
the very database this ledger is meant to be independent of.

`services/api/src/services/operatorAlert.js` emits on that path: a structured
`[operator-alert]` line to stderr **always**, plus email to `ADMIN_EMAILS` via
the repository's existing Resend sender. It never throws, so it cannot mask the
failure it is reporting. `GET /readyz` reports `operatorAlert.configured` so an
unconfigured mailbox is visible rather than silent.

Note that `services/api/src/config/sentry.js` is an intentional **no-op** in the
education/research publication build. Alerts must not be routed there.

## Environment

| Variable | Meaning |
|---|---|
| `ACCOUNT_CLOSURE_LEDGER_SECRET` | Transport HMAC secret, ≥32 chars. **Must be byte-identical to the value on `genemap-api`.** The process refuses to start without it. |
| `LEDGER_DATA_DIR` | Volume mount path. Defaults to `/data`. |
| `PORT` / `HOST` | Listen address. Defaults `8080` / `0.0.0.0`. |
| `LEDGER_WRITE_PATH` / `LEDGER_READ_PATH` / `LEDGER_ANCHOR_PATH` | Route overrides. Default `/tombstones/write`, `/tombstones/read`, `/tombstones/anchor`. |
| `LEDGER_RETENTION_DAYS` | Tombstone retention. Defaults to and may only exceed the 2192-day (6-year) floor; a lower or unparseable value **refuses to boot**. |

The ledger never sees `ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS`. Those keys stay on
the API side; the ledger only ever stores the already-hashed `userIdHash` and its
`identityKeyId`, so a full copy of this ledger cannot be reversed into a list of
users.

## Deploying

The service is not built from the repo root (it is outside the pnpm workspace on
purpose — zero dependencies, no lockfile). Deploy it explicitly:

```sh
railway up ops/closure-ledger --path-as-root -s genemap-closure-ledger
```

It needs a volume mounted at `/data` and `ACCOUNT_CLOSURE_LEDGER_SECRET` set.

Then point the API at it:

```sh
railway variables -s genemap-api \
  --set "ACCOUNT_CLOSURE_LEDGER_WRITE_URL=https://<ledger-domain>/tombstones/write" \
  --set "ACCOUNT_CLOSURE_LEDGER_READ_URL=https://<ledger-domain>/tombstones/read" \
  --set "ACCOUNT_CLOSURE_LEDGER_SECRET=<same secret>" \
  --set "ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS=<key-id>=<32+ char secret>"
```

The URLs must be `https:` — the API client rejects any other scheme.

## Tests

```sh
pnpm test:ledger
```

The contract tests drive the **real** API client against the **real** server over
real HTTP. A hand-written mock of either side would only prove the mock agrees
with itself; the point is that two independently written HMAC implementations
line up exactly.
