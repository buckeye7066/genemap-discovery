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
| Restore-independent tombstone contract | Production account deletion fails closed unless an HMAC-signed external deletion authorization can be written. `scripts/reconcile-account-closure-ledger.mjs` applies those tombstones while a restored database is quarantined. |
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
- the external deletion-ledger protocol is implemented, but its production
  operator, URLs, secret custody, immutability, retention, alerting, and a
  successful write/read/reconciliation drill are not yet evidenced;
- `ConsentRecord` and `DataDeletionRequest` currently cascade with `User`,
  so the schema does not support a claimed six-year evidence record after
  account deletion;
- repository tooling now refuses a restore-reconciliation run without a
  quarantine acknowledgement and an external ledger, but no current production
  drill proves that the configured operator can write, read, and reconcile the
  exact release; restored service must remain quarantined until that drill passes;
- backup cadence, automatic expiry, immutability, remote operator, key custody,
  recovery access, RPO/RTO, and a current restore drill are not evidenced;
- provider retention, regions, deletion/export behavior, contracts, and
  subprocessors remain incomplete in `docs/PROCESSOR_REGISTER.md`.

## Deletion request behavior

`POST /entities/data-deletion-request` is a limited content purge, not verified
full account closure. It currently deletes three legacy categories in one
transaction. If processing fails, the route attempts to mark the request
`failed` and returns 503, but there is still no durable retry worker or alert. The public policy must not represent this endpoint as
complete erasure of the account, provider logs, or backups.

The remaining production deletion work is:

1. approve the category and legal-exception manifest and retention periods;
2. configure a restore-independent ledger operator and prove HMAC-authenticated
   writes, signed/fresh read responses, idempotency, immutability, alerting, and
   custody for the exact release;
3. run the quarantined restore reconciliation and retain its zero-blocker output;
4. implement and evidence deletion/export propagation for each active processor
   and retained backup class;
5. add durable retry/alerting for the limited content-purge endpoint or remove it
   in favor of the complete account-closure workflow;
6. verify every category, processor result, partial failure, retry, and restore
   path with current operational evidence.

## Backup and restore

Follow `docs/BACKUP.md`. A checksum proves integrity, not recoverability.
Database restores must stay isolated with outbound integrations disabled until
schema integrity and deletion/tombstone reconciliation pass. No repository text
may assert daily backups, a fixed retention window, or a restore SLA without
current operational evidence.

## Review gate

Do not mark privacy, retention, deletion, backup, or processor review complete
until the missing controls above are implemented and evidenced against the exact
release SHA. Re-review after every material schema, processor, telemetry, or
backup change.
