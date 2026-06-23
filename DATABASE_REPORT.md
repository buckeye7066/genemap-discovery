# DATABASE_REPORT — GeneMap Discovery (Prisma / PostgreSQL)

Schema: `services/api/prisma/schema.prisma`. Migrations: a single `0_init`
(dev uses `pnpm db:push`; prod uses `db:migrate:deploy`). **No live
`DATABASE_URL` was available in this session**, so schema changes were *not*
applied via `db:push`; correctness-critical invariants were instead enforced in
application code (transactions) and the DB-level constraints are documented here
as the recommended migration.

## Constraints / indexes present (verified)
| Model | Unique | Index | Cascade |
|-------|--------|-------|---------|
| User | `email` | — | (root) |
| Session | — | `[userId]` | on User delete |
| Subscription | `stripeSubscriptionId` | `[userId,status]` | on User delete |
| ProjectCollaborator | `[projectId,userId]` ✅ | — | on Project/User |
| LearningProgress | `[userId,topicId]` | `[userId]` | on User |
| SearchHistory | — | `[userId,createdAt]` ✅ | on User |
| AIConversation | — | `[userId,assistantType]` ✅ | on User |
| MedicalData | — | `[userId,dataType]` | on User |
| AuditLog | — | `[userId,createdAt]` | SET NULL |
| StripeEvent | `stripeEventId` | — | (webhook dedup) |
| LicenseAssignment | — | `[userEmail,status]`, `[licenseId]` | on License |
| ConsentRecord | — | `[userId,consentType]` | on User |
| DataDeletionRequest | — | `[userId]` | on User |
| ProjectAnnotation | — | `[projectId,targetType,targetId]` | on Project/User |

## Gaps + how they are currently handled
| Gap | Risk | Current mitigation | Recommended migration |
|-----|------|--------------------|----------------------|
| No `@@unique` on active license seat per user | duplicate seat / double count | **App-enforced** in a `$transaction` (B-106) | `@@unique([licenseId, userEmail])` *or* a partial unique index `WHERE status='active'` (raw SQL, since Prisma lacks partial-unique) |
| `Session.expiresAt` not indexed; no prune job | stale sessions linger to expiry | refresh rotation invalidates on use | add `@@index([expiresAt])` + a periodic `deleteMany({ where:{ expiresAt:{ lt: now }}})` job |
| `DataDeletionRequest.status` not indexed | slow batch sweep at scale | low volume today | add `@@index([status, createdAt])` |
| `User.email` is `String @unique`, not `citext` | relies on app `normalizeEmail` | every read/write normalizes | migrate column to `citext`, drop app normalization |
| `ProjectVersion.createdBy` is a string, not an FK | no referential integrity | set from `request.user.userId` | make it a relation, or document as intentional |

Cascade deletes are well-modeled: deleting a User cleans up sessions,
subscriptions, history, gene sets, projects (and their versions/annotations/
collaborators), conversations, medical data, consent, and deletion requests.

## Why DB constraints were deferred
Adding a unique constraint or index requires `db:push`/`migrate` against a real
database to (a) confirm no existing rows violate it and (b) generate the
migration SQL. With no `DATABASE_URL` here, shipping an unvalidated migration
would risk a failed deploy. The application-layer transaction guarantees
correctness today; the migration is the durability hardening for the next PR
that has DB access. Suggested commands:
```bash
# with DATABASE_URL set:
pnpm --filter @genemap/api db:migrate -- --name license_seat_unique_and_session_index
pnpm --filter @genemap/api db:migrate:deploy
```
