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
reviewed lifecycle operations; removing a route does not delete stored data.

## Enforced in code

| Category | Repository-enforced behavior |
| --- | --- |
| Sessions | Refresh-token sessions have expiry fields and an indexed, idempotent maintenance sweep deletes rows whose expiresAt is at or before the run time. No production schedule is evidenced. |
| Self-service content request | An authenticated request creates a server-scoped DataDeletionRequest, then transactionally deletes that user's legacy MedicalData, AIConversation, and SearchHistory rows. Caller-supplied categories are ignored. |
| Deletion retries | Requests use finite states, attempt fencing, expiring leases, bounded exponential retry, and an operator-review terminal state. Only finite codes (local_purge_failed, retry_exhausted, subject_unavailable, and legacy_state_requires_review) may persist; exception text is not stored. |
| Evidence preservation | Consent and deletion evidence survives local account deletion with a nullable user relation and an opaque UUID subjectRef. Consent IP addresses and free-form metadata are scrubbed during account deletion. subjectRef is pseudonymous, not anonymous. |
| Manual backup artifact | Database-bearing snapshots fail closed, use tracked source only, require age encryption, write a checksum, and restrict local permissions. |
| Publication APIs | Medical-data, conversation, VCF, variant/ClinVar, and clinical-trial paths are blocked before body parsing, route authentication, and handlers. |

The bounded worker is available as `pnpm privacy:maintenance`. The repository
does not prove that any production scheduler invokes it. A green unit or
migration test is not evidence of an operating schedule or alert path.

## Not yet enforced or evidenced

The following remain release blockers, not promises:

- no approved TTL or scheduled purge exists for search history, activity,
  legacy conversations, support data, audit/log data, or processor copies;
- a content-deletion request does not delete or anonymize the user profile,
  learning data, activities, gene sets, projects, collaborations, annotations,
  messages, subscriptions, Stripe-side objects, processor copies, or backups;
- the retry worker has no externally evidenced production schedule, alert,
  on-call owner, or run history;
- no external deletion/tombstone ledger is reconciled before restoring an old
  database; the database-local subjectRef is not a restore tombstone;
- no processor-propagation ledger proves deletion/export results;
- backup cadence, automatic expiry, immutability, remote operator, key custody,
  recovery access, RPO/RTO, and a current restore drill are not evidenced;
- provider retention, regions, deletion/export behavior, contracts, and
  subprocessors remain incomplete in `docs/PROCESSOR_REGISTER.md`.

## Deletion request behavior

`POST /entities/data-deletion-request` is a limited local content purge, not
verified full account closure. It requests exactly three legacy categories in
one transaction. deletedTypes remains empty until that transaction commits.
If immediate processing cannot complete, the durable request returns 202
Accepted with a sanitized retry_scheduled, processing, or operator_review
status. retry_scheduled and expired processing leases remain worker-eligible;
operator_review is terminal and requires an accountable operator. A 5xx is
reserved for failure to create and retain the request itself.

A super-administrator's local account deletion finalizes open requests only
because the database cascade removes those three local categories. It does not
prove deletion from processors, billing systems, logs, backups, or restored
copies.

A production-ready deletion program still requires:

1. verified request identity and a documented cancellation/cool-off policy;
2. an approved category, retention-duration, and legal-exception manifest;
3. an externally scheduled worker with alerting and reviewed run evidence;
4. propagation to every user-owned model, object store, Stripe, email,
   telemetry, hosting, and other processors;
5. an external tombstone ledger applied before any restored service is exposed;
6. tests and operational evidence for each processor result, partial failure,
   retry, backup expiry, key erasure, and restore reconciliation.

## Backup and restore

Follow `docs/BACKUP.md`. A checksum proves integrity, not recoverability.
Database restores must stay isolated with outbound integrations disabled until
schema integrity and external deletion/tombstone reconciliation pass. No
repository text may assert daily backups, a fixed retention window, or a restore
SLA without current operational evidence.

## Review gate

Do not mark privacy, retention, deletion, backup, or processor review complete
until the missing controls above are implemented and evidenced against the exact
release SHA. Re-review after every material schema, processor, telemetry,
scheduler, or backup change.
