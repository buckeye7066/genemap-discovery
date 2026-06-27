# Data Retention Policy

This document is the production baseline for GeneMap Discovery data retention.
It is an operational policy, not legal advice. A launch reviewer must confirm
that it matches the business model, user terms, and any healthcare/privacy
obligations before real users are admitted.

## Scope

This policy covers user accounts, authentication sessions, genomic and medical
records, AI conversations, search and learning history, audit logs, billing
records, backups, and deletion requests stored by GeneMap Discovery.

## Default Retention

| Data category | Default retention | Notes |
| --- | --- | --- |
| User profile and account data | While the account is active | Deleted or anonymized after a verified deletion request unless retention is legally required. |
| Medical and genomic data | User-controlled while the account is active | Stored encrypted in production. Raw VCF content is not sent to LLM routes by default. |
| AI conversations | 365 days from last update, unless user deletes sooner | Shorter retention is preferred when product needs allow it. |
| Search history and learning sessions | 365 days | Used for user history, limits, and learning progress. |
| Consent records | 6 years | Retained to prove consent state and version at the time of processing. |
| Audit and security logs | 6 years | Retained for abuse investigation, access review, and compliance evidence. |
| Stripe billing metadata | 7 years | Retained for accounting, tax, chargeback, and subscription support needs. |
| Active sessions | Until expiry or logout | Refresh-token sessions expire automatically and are removed by account deletion. |
| Data deletion requests | 6 years | Retained as evidence of request handling. |
| Database backups | At least 7 days; production target 30 days | Backups age out according to the configured backup schedule. |

## Deletion Requests

Verified user deletion requests must be completed within 30 days. The normal
flow is:

1. Verify the requester controls the account.
2. Create or update a `DataDeletionRequest` record.
3. Delete user-owned records through the cascade path where possible.
4. Preserve only records required for legal, tax, fraud prevention, security,
   or compliance evidence.
5. Mark the request completed with `completedAt` and the deleted data types.

Backups are not rewritten for individual deletion requests. Deleted data ages
out of backups through the retention window. Restore procedures must re-apply
completed deletion requests before any restored environment is exposed to users.

## Backup Retention

Production database backups must be enabled before launch. The minimum accepted
retention is 7 days; the preferred production baseline is 30 days. Backups that
contain medical, genomic, or account data must be encrypted by the storage
provider or encrypted before transfer to any external archive.

Restore testing must happen at least quarterly and before launch. Record the
latest restore test in `ops/production-launch-evidence.json`.

## AI and Genomic Data Handling

GeneMap is research and education software. It must not represent generated
content as diagnosis or treatment. Raw genomic uploads remain on deterministic
API paths by default. Any future change that sends genomic-looking content to
an LLM must require explicit consent, audit logging, and a separate legal and
security review.

## Access and Review

Production data access is limited to authorized operators with a legitimate
support, security, billing, or compliance need. Access to backups, dashboards,
and logs must be reviewed at least quarterly.

Review this policy before launch, after any material data model change, after
any change to AI processing of genomic data, and at least annually.
