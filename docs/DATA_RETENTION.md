# Data retention implementation status

This document records what the repository currently enforces. It is not a
production-retention guarantee or legal advice. GeneMap's education/research
publication boundary does not make the remaining account, log, billing, legacy,
processor, or backup lifecycle complete.

## Publication boundary

The published product does not expose personal medical-record upload, VCF,
variant/ClinVar interpretation, AI-conversation persistence, clinical trials,
clinical personas, diagnosis, pharmacogenomics, treatment, or dosing features.
Legacy rows and schema models from earlier releases may still exist and require
a reviewed migration; removing a route does not delete previously stored data.

## Enforced today

| Category | Repository-enforced behavior |
| --- | --- |
| Sessions | Refresh-token sessions have expiry fields and are removed when their user row is deleted. |
| Self-service content request | An authenticated request creates a `DataDeletionRequest` and transactionally deletes that user's legacy `MedicalData`, `AIConversation`, and `SearchHistory` rows. |
| Permanent account closure | Email, password, and exact-phrase confirmation bind the action. Open Stripe checkouts are reconciled, subscriptions are cancelled before database deletion, successful cancellation is persisted locally, received-message content is removed, institutional seats are decremented atomically, and non-billing customer cleanup has a bounded retry worker. |
| Restore-independent tombstone contract | Production account deletion fails closed unless an HMAC-signed external deletion authorization can be written and the ledger returns a fresh HMAC-signed acknowledgement for the exact receipt. Tombstones carry a versioned identity-key ID so retained historical keys can survive rotation. `scripts/reconcile-account-closure-ledger.mjs` applies those tombstones while a restored database is quarantined and blocks exposure when a required key is unavailable. |
| Manual backup artifact | Database-bearing snapshots fail closed, use tracked source only, require `age` encryption, write a checksum, and restrict local permissions. |
| Publication APIs | Medical-data, conversation, VCF, variant/ClinVar, and clinical-trial paths are blocked before route authentication and handlers. |

## Not yet enforced

The following are release blockers, not promises:

- no scheduled TTL purge exists for search history, activity, legacy
  conversations, support data, or audit/log data;
- a content-deletion request does not delete or anonymize the user profile,
  learning data, activities, gene sets, projects, collaborations, annotations,
  messages, subscriptions, Stripe-side objects, processor copies, or backups;
- the permanent-account-closure path now has exact receipts and a bounded
  customer-cleanup retry worker, but the limited content-purge endpoint still
  has no durable retry worker or operator alert;
- the external deletion ledger is now deployed and configured (`ops/closure-ledger/`,
  its own service and volume, never the application Postgres), and live drills on
  2026-08-19 evidenced the operator, both HTTPS URLs, transport-secret and
  identity-key custody, authenticated writes, signed fresh exact-receipt
  acknowledgements, signed fresh read responses, idempotent replay, refusal to
  overwrite an existing receipt, tombstone retention and expiry, off-platform
  anchoring of the hash chain, alerting on write failure, and an exercised key
  rotation. Still unevidenced: a reconciliation drill against an actually
  restored database;
- `ConsentRecord` and `DataDeletionRequest` currently cascade with `User`,
  so the schema does not support a claimed six-year evidence record after
  account deletion;
- repository tooling now refuses a restore-reconciliation run without a
  quarantine acknowledgement and an external ledger. The 2026-08-19 drill proved
  the configured operator can write, read, and authenticate on the exact release,
  but it did NOT reconcile against a restored database; restored service must
  remain quarantined until that half of the drill passes;
- backup cadence, automatic expiry, immutability, remote operator, key custody,
  recovery access, RPO/RTO, and a current restore drill are not evidenced;
- provider retention, regions, deletion/export behavior, contracts, and
  subprocessors remain incomplete in `docs/PROCESSOR_REGISTER.md`.

## Account-deletion tombstone retention

**Tombstones in the external deletion ledger are retained for 2192 days
(6 years) from the moment they are recorded, and the period can only be
lengthened.**

Reasoning, in the order that decided it:

1. The ledger's purpose is to *prove a deletion happened* and to reconcile a
   restored database against it. Expiry that destroys that proof defeats the
   control, so the period is set by how long the proof may be needed — not by
   storage cost. Each record is a few hundred bytes of pseudonymous data
   (`userIdHash` + receipt + key id), so there is no cost pressure to shorten it.
2. Six years is the evidence period this document already contemplates for a
   post-deletion evidence record.
3. The binding constraint is backups. A tombstone must outlive every backup that
   could restore the account it describes, or a restore could resurrect a deleted
   account with no tombstone left to reconcile against — the exact failure the
   ledger exists to prevent. Backup cadence, retention, and expiry are still
   **not evidenced** for this project (see the list above), so that window is
   unknown and the floor is deliberately set well above any plausible value.

`LEDGER_RETENTION_DAYS` may raise the period. A value below the 2192-day floor,
or an unparseable one, makes the ledger process **refuse to boot**, so retention
cannot be quietly shortened by an environment change.

**What expiry does.** It retires a tombstone from the reconciliation projection
by *appending* a retention marker to the same hash chain. The original
chain-bearing record is never rewritten and never removed: the chain still
verifies end to end, the proof survives, and a re-write of an expired receipt is
still refused with `409`. Expired tombstones drop out of the read used by
`scripts/reconcile-account-closure-ledger.mjs` and stay visible under
`?includeExpired=1`.

## Deletion ledger immutability — precise claim

The ledger's hash chain is **tamper-evident, not tamper-proof**. Anyone with
control of the ledger's volume can delete a record and re-chain everything after
it into a log that verifies perfectly against itself, and no check running on
that host can detect it.

What is in place is **off-platform anchoring**: the chain head is published into
`ops/closure-ledger/anchors/chain-anchors.jsonl` in the GitHub repository, which
the ledger host cannot write to, and every run re-checks the live ledger's hash
at each previously published sequence before publishing a new one. A rewrite of
any record at or before an anchored sequence changes that hash, so it is
**externally detectable by comparison**.

This must not be described as immutability. Making the ledger genuinely
append-only would require storage the operator cannot rewrite (object-lock /
WORM), which is not in place.

## Deletion request behavior

`POST /entities/data-deletion-request` is a limited content purge, not verified
full account closure. It currently deletes three legacy categories in one
transaction. If processing fails, the route attempts to mark the request
`failed` and returns 503, but there is still no durable retry worker or alert.
The public policy must not represent this endpoint as complete erasure of the
account, provider logs, or backups.

The remaining production deletion work is:

1. approve the category and legal-exception manifest and retention periods;
2. ~~configure a restore-independent ledger operator and prove HMAC-authenticated
   writes, signed/fresh exact-receipt acknowledgements, signed/fresh read
   responses, idempotency, immutability, alerting, and custody for the exact
   release~~ — done 2026-08-19 except that "immutability" is correctly stated as
   tamper-evident plus off-platform anchoring, not tamper-proof (see above);
3. ~~configure `ACCOUNT_CLOSURE_LEDGER_IDENTITY_KEYS` with the current write key
   first and every still-needed historical key retained; document key IDs,
   rotation, retirement criteria, and custody separately from the transport
   HMAC secret~~ — done, and the rotation was **exercised in production** on
   2026-08-19: current write key `2026-08-19-rot1`, retired read-only key
   `2026-08` retained;
4. run the quarantined restore reconciliation and retain its zero-blocker output;
5. implement and evidence deletion/export propagation for each active processor
   and retained backup class;
6. add durable retry/alerting for the limited content-purge endpoint or remove it
   in favor of the complete account-closure workflow;
7. verify every category, processor result, partial failure, retry, key-rotation,
   and restore path with current operational evidence.

## Backup and restore

Follow `docs/BACKUP.md`. A checksum proves integrity, not recoverability.
Database restores must stay isolated with outbound integrations disabled until
schema integrity and deletion/tombstone reconciliation pass. No repository text
may assert daily backups, a fixed retention window, or a restore SLA without
current operational evidence.

## Review gate

Do not mark privacy, retention, deletion, backup, or processor review complete
until the missing controls above are implemented and evidenced against the exact
release SHA. Re-review after every material schema, processor, telemetry,
identity-key, or backup change.
