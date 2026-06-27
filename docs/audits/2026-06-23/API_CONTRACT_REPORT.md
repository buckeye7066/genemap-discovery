# API_CONTRACT_REPORT — GeneMap Discovery

## Strategy adopted
**Backend returns envelopes; the shared client unwraps them.** Every backend
route returns a named-key object (`{entries}`, `{sets}`, `{records}`, `{project}`,
…). `packages/shared/src/client.ts` unwraps each to the typed value the UI
actually consumes, so page components never see the envelope. Errors are thrown
as `ApiError` carrying `status`, `code`, and `details`.

This was implemented in the preserved baseline (`3db891a`) and is covered by 47
shared-package tests (`packages/shared/src/__tests__/client.test.js`). This audit
fixed the **frontend page** side, which still spoke the old Base44 dialect.

## Verified client ↔ backend envelope map

| Endpoint | Backend returns | Client method returns | Status |
|----------|-----------------|----------------------|--------|
| GET /entities/search-history | `{entries}` | `SearchHistoryEntry[]` | ✅ |
| GET /entities/gene-sets | `{sets}` | `GeneSet[]` | ✅ |
| GET /entities/projects | `{projects}` | `Project[]` | ✅ |
| GET /entities/projects/:id/versions | `{versions}` | `ProjectVersion[]` | ✅ |
| GET /entities/projects/:id/annotations | `{annotations}` | `Annotation[]` | ✅ |
| GET /entities/messages | `{messages}` | `Message[]` | ✅ |
| GET /entities/medical-data | `{records}` | `MedicalData[]` | ✅ |
| GET /entities/consent | `{records}` | `ConsentRecord[]` | ✅ |
| GET /entities/licenses | `{licenses}` | `License[]` | ✅ |
| GET /education/topics | `{categories}` | `TopicCategory[]` | ✅ |
| GET /education/progress | `{sessions,progress}` | object (intentional) | ✅ |
| GET /admin/users | `{users,total,page,limit}` | object (intentional) | ✅ |
| GET /admin/messages | `{messages}` | object (intentional) | ✅ |

## Contract bugs fixed (frontend was still on Base44 field names)

1. **Search-history write (B-101).** `Search.jsx` posted `{phenotype_query,
   hpo_term, candidate_genes, search_type, results_count}`. Backend requires
   `{query, queryType, results}` and throws `ValidationError('query is required')`
   when `query` is absent → **every save 400'd**, silently (caught + `log.debug`).
   Now posts the correct shape, packing display extras into the `results` JSON.

2. **Gene-set save (B-102).** `Search.jsx` used `saveMedicalData` (needs
   `dataType`+`content`, consent-gated) for a gene set. Now uses `saveGeneSet`.

3. **Search-history read (B-103).** `History.jsx` read snake_case fields the PG
   backend never emits. Now normalizes the real shape, tolerant of legacy rows.

## ApiError contract
```ts
class ApiError extends Error { status: number; code?: string; details?: unknown }
```
Thrown from `ApiClient.request()` on any non-2xx. `204 No Content` returns
`undefined` (no `.json()` throw). Consumers (`AuthContext`) branch on
`error.status` / `error.code`.

## Residual contract notes (low risk)
- `Anastasia.jsx` uses error-path fallbacks like `.catch(() => ({ sets: [] }))`
  that return the *old* envelope shape; only reached on failure, where the value
  is then defensively handled. Harmless but inconsistent — recommend `.catch(() => [])`.
- A few genomics/clinical-trials client methods intentionally return a union
  (`{hits?}|T[]`) because upstream shapes vary; consumers normalize.
