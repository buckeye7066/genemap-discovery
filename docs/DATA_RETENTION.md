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
| Manual backup artifact | Database-bearing snapshots fail closed, use tracked source only, require `age` encryption, write a checksum, and restrict local permissions. |
| Publication APIs | Medical-data, conversation, VCF, variant/ClinVar, and clinical-trial paths are blocked before route authentication and handlers. |

## Not yet enforced

The following are release blockers, not promises:

- no scheduled TTL purge exists for search history, activity, legacy
  conversations, support data, or audit/log data;
- a content-deletion request does not delete or anonymize the user profile,
  learning data, activities, gene sets, projects, collaborations, annotations,
  messages, subscriptions, Stripe-side objects, processor copies, or backups;
- deletion processing has no durable retry worker, alert, attempt counter, or
  external processor-propagation ledger;
- `ConsentRecord` and `DataDeletionRequest` currently cascade with `User`,
  so the schema does not support a claimed six-year evidence record after
  account deletion;
- no external deletion/tombstone ledger is reconciled before restoring an old
  database, so restore must remain quarantined;
- backup cadence, automatic expiry, immutability, remote operator, key custody,
  recovery access, RPO/RTO, and a current restore drill are not evidenced;
- provider retention, regions, deletion/export behavior, contracts, and
  subprocessors remain incomplete in `docs/PROCESSOR_REGISTER.md`.

## Deletion request behavior

`POST /entities/data-deletion-request` is a limited content purge, not verified
full account closure. It currently deletes three legacy categories in one
transaction. If processing fails, the request can remain pending and there is
no durable retry worker. The public policy must not represent this endpoint as
complete erasure of the account, provider logs, or backups.

A production-ready deletion design requires:

1. verified request and cancellation/cool-off policy;
2. explicit category and legal-exception manifest;
3. pseudonymized, non-cascading evidence records where legally justified;
4. durable queued states, attempts, errors, alerts, and idempotent retries;
5. propagation to every user-owned model, object store, Stripe, email,
   telemetry, hosting, and other processors;
6. an external tombstone ledger applied before any restored service is exposed;
7. tests for each category, processor result, partial failure, retry, and
   restore reconciliation.

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
