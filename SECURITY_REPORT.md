# SECURITY_REPORT — GeneMap Discovery

Scope: `services/api` authorization, input validation, secrets, CSRF, desktop.
Most of the heavy lifting was in the preserved baseline (`3db891a`); this audit
verified each control against the live code and closed the remaining gaps.

## Authorization — status by concern

| Concern | Status | Evidence |
|---------|--------|----------|
| Project IDOR (read/update/delete) | ENFORCED | `requireProjectAccess()` entities.js — throws NotFound for missing, Forbidden for unauthorized; never leaks existence. |
| Project versions IDOR | ENFORCED | `GET /projects/:id/versions` calls `requireProjectAccess` first. |
| Annotations IDOR (GET/POST/PUT/DELETE) | ENFORCED | GET/POST gated by access (+`['owner','editor']` for writes); PUT/DELETE also verify annotation author. |
| Collaborator removal cross-project | ENFORCED | delete bound to `{id, projectId}`. |
| **Collaborator role injection** | **FIXED (B-105)** | role constrained to `[editor,viewer]`; self-add rejected; idempotent upsert. |
| License seat: assignment belongs to license | ENFORCED | delete bound to `{id, licenseId}`. |
| License seat: count cannot go negative | **FIXED (B-106)** | decrement guarded `assignedSeats > 0`. |
| **License seat: duplicate active assignment** | **FIXED (B-106)** | reject existing active `(licenseId,userEmail)` inside txn. |
| License seat: atomic reservation (TOCTOU) | ENFORCED | conditional `updateMany ... assignedSeats < maxSeats` in a `$transaction`. |
| Email normalization | ENFORCED (app) | `normalizeEmail()` on all lookups/writes; DB `citext` still recommended. |
| grant-admin requires super_admin | ENFORCED | `preHandler: requireSuperAdmin`. |
| Admin cannot delete/ban self | ENFORCED | explicit checks in `/users/:id`, `/ban`. |
| Admin cannot ban/demote super_admin | ENFORCED | role check before ban. |
| Destructive admin actions audit-logged | ENFORCED | `createAuditLog(..., {required:true})` on ban/unban/pre-ban/grant-*/delete. |
| Admin nav hidden from non-admins | **FIXED (B-104)** | `useAuth()` role gate in Layout (UI sugar; backend is the boundary). |

## Secrets / sensitive data
- **Medical-data encryption fail-closed in prod**: `encryption.js` throws if
  `MEDICAL_DATA_ENCRYPTION_KEY` is missing/not 64-hex when `NODE_ENV=production`.
  Dev/test degrade to plaintext **with a warning**. ✅
- **Legacy plaintext detection**: `decrypt()` recognizes the AES-GCM envelope and
  returns non-envelope rows unchanged, so pre-encryption records still read. ✅
- **Consent gate**: `POST /entities/medical-data` requires a granted
  `medical_data_storage` consent record before writing. ✅
- **Log redaction**: `sanitizeError()` strips `password|secret|key|token|
  authorization` + Bearer tokens before logging. LLM/audit logs record only
  `promptLength`/`messageCount`, never prompt content. ✅
- Residual: `sanitizeError` does not specifically scrub arbitrary medical-data
  strings that might appear in an unexpected error. Low risk (content is not put
  into error messages today). Recommend a boundary catch around `decrypt`.

## Input validation
- Zod is used for auth + billing bodies. Many entities/admin routes still use
  ad-hoc `if (!x) throw` checks. **This audit added**:
  - collaborator `role` enum + self-add guard (B-105),
  - LLM prompt/message bounds (B-109),
  - genomic query length bound (B-107).
- **Remaining (M):** `genes`/`messages`/`metadata` arrays and `category`/
  `consentType`/`dataType` strings are still unbounded/unconstrained. Recommend
  promoting `packages/shared/src/schemas.ts` to the single source of truth and
  importing it in both client and `entities.js`/`admin.js`.

## CSRF
- HMAC double-submit token bound to userId (`csrf.js`); applied globally via
  `preHandler`; exempts GET/HEAD/OPTIONS, auth login/register/refresh, and the
  Stripe webhook (raw-body signature is its own auth). Client injects
  `X-CSRF-Token` on mutating requests. ✅ (6 csrf tests pass.)

## Desktop (Electron)
- `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`. ✅
- `setWindowOpenHandler` + `will-navigate` enforce an https host allow-list;
  everything else denied. ✅
- DevTools only in dev (`!app.isPackaged`). ✅
- Preload exposes only `platform` + `isElectron`. ✅
- Icons now generated (B-110) so signed installer builds don't fail.

## Top remaining risks (security)
1. **M** — Unbounded/loosely-typed entities bodies (size-DoS, junk metadata). Add shared Zod.
2. **M** — No DB-level unique on active license seats (app-enforced only).
3. **L** — Sessions not pruned server-side; a leaked refresh token is valid until expiry/rotation.
4. **L** — Medical content not explicitly redacted from unexpected error paths.
