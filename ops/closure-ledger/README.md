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
| `GET /healthz` | Unauthenticated liveness for the platform healthcheck. Reports record count and hash-chain validity; never returns tombstone content. |

Requests that are unsigned, mis-signed, stale, or carry a malformed tombstone are
refused. A second write of an existing `receiptId` with a **different** payload is
a `409`, never an overwrite.

## Storage

Append-only JSONL at `$LEDGER_DATA_DIR/tombstones.jsonl`, one record per line:

```json
{"seq":1,"recordedAt":"...","prevHash":"...","hash":"...","tombstone":{...}}
```

Each `hash` covers the previous hash, so any edit to a historical record breaks
the chain. `verifyChain()` runs at boot (the process refuses to start on a broken
chain) and on every `/healthz` probe. Writes are `fsync`ed before the
acknowledgement is sent, because the client treats that acknowledgement as the
point of no return for the deletion.

## Environment

| Variable | Meaning |
|---|---|
| `ACCOUNT_CLOSURE_LEDGER_SECRET` | Transport HMAC secret, ≥32 chars. **Must be byte-identical to the value on `genemap-api`.** The process refuses to start without it. |
| `LEDGER_DATA_DIR` | Volume mount path. Defaults to `/data`. |
| `PORT` / `HOST` | Listen address. Defaults `8080` / `0.0.0.0`. |
| `LEDGER_WRITE_PATH` / `LEDGER_READ_PATH` | Route overrides. Default `/tombstones/write` and `/tombstones/read`. |

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
