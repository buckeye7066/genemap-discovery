# GeneMap account-closure ledger

This is the independently deployed, append-only authorization ledger used by
GeneMap account deletion. It stores only a keyed user-ID hash, identity-key ID,
receipt ID, authorization time, release identity, actor mode, and completed
billing counts. It rejects raw email/profile fields and never connects to the
primary GeneMap database.

## Production deployment

Deploy this directory as a separate service using `railway.json` and mount a
durable volume at `/ledger-data`. Run one replica because the immutable record
files live on that mounted volume. Configure:

- `ACCOUNT_CLOSURE_LEDGER_SECRET`: a random 32+ character transport secret,
  stored in the secret manager and shared only with the GeneMap API.
- `ACCOUNT_CLOSURE_LEDGER_DIRECTORY=/ledger-data/tombstones`.
- `NODE_ENV=production`, `HOST=0.0.0.0`, and the platform-provided `PORT`.

Enable independent volume snapshots/backups and restore-test them before a
launch. Do not place the volume in the primary database's backup lifecycle.

Configure the API with the same transport secret and these public TLS routes:

- `ACCOUNT_CLOSURE_LEDGER_WRITE_URL=https://<ledger-host>/tombstones/write`
- `ACCOUNT_CLOSURE_LEDGER_READ_URL=https://<ledger-host>/tombstones/read`

The service authenticates requests and responses with timestamped HMAC-SHA256,
limits clock skew and request size, requires receipt-matched idempotency keys,
persists each receipt immutably with an atomic link plus fsync, and verifies all
records on startup. A conflicting retry or corrupt record fails closed.

## Verification

Run `pnpm test:ledger` from the repository root. The suite covers authenticated
writes and reads, response signatures, exact idempotency, conflicts, pagination,
restart recovery, corruption detection, and unsafe production configuration.
