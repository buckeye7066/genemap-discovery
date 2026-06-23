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

## Migration shipped (second pass)
`prisma/migrations/20260623190000_session_deletion_indexes_seat_unique/migration.sql`
(idempotent `CREATE INDEX IF NOT EXISTS`):
- `sessions_expires_at_idx` — session-expiry sweeps.
- `data_deletion_requests_status_requested_at_idx` — pending-request batches.
- `license_assignments_active_user_unique` — **partial** unique index
  (`WHERE status = 'active'`) enforcing one active seat per (license, user).

`schema.prisma` was updated to declare the two named indexes (so `db push` and
`migrate` agree). The partial unique index is **migration-only** — Prisma's
schema language can't express a `WHERE` clause — so the dev `db push` path will
not create it; the same invariant is enforced in `routes/entities.js`, so both
paths stay correct. Schema validated with `prisma validate` / `prisma format`
(the lone "error" is the absent `DATABASE_URL` env in `getConfig`, not a schema
fault). Apply in prod with:
```bash
pnpm --filter @genemap/api db:migrate:deploy   # with DATABASE_URL set
```

## Still recommended (not done)
- A scheduled job to actually prune expired sessions (the index now supports it).
- `citext` migration for `users.email` to retire app-layer normalization.
- Make `ProjectVersion.createdBy` a real FK or document it as intentionally loose.
