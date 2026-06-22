# CLAUDE.md — GeneMap Discovery

Genomic analysis platform. pnpm-workspaces monorepo, ~98% migrated off Base44. Auto-generated map.

## Tech stack
React 18 + Vite + TS + Tailwind + Radix (apps/web) · Node + **Fastify 5.8** + Prisma 6.2 + PostgreSQL 16 (services/api) · Electron (apps/desktop) · TS shared pkg (packages/shared) · Anthropic Claude + OpenAI (lazy-loaded) · Stripe · JWT (access 15m + refresh 7d) + bcrypt + httpOnly cookies.

## Run / build / test (pnpm)
```bash
pnpm dev              # dev:api + dev:web
pnpm dev:api          # Node --watch @ :3000
pnpm dev:web          # Vite @ :5173
pnpm build
pnpm test ; pnpm lint ; pnpm typecheck
pnpm db:push          # schema → dev DB
pnpm db:migrate       # new migration
pnpm db:migrate:deploy
pnpm db:studio
```

## Entry points
- Frontend: `apps/web/main.jsx` → `App.jsx` (Router + QueryClient + AuthProvider)
- Backend: `services/api/src/index.js` — Fastify bootstrap, port 3000
- Desktop: `apps/desktop/main.js` (bundles web dist)
- Shared: `packages/shared/src/index.ts` (exports `client` + types)

## Directory map
- `apps/web/` — main.jsx, App.jsx, pages/, components/ (ai, clinical, dashboard…), lib/ (AuthContext, QueryClient)
- `services/api/src/` — index.js, config/env.js (Zod, prod-hard-fail), middleware/ (auth, csrf, errorHandler, entitlements), routes/ (auth, billing, education, llm, admin, entities, genomics, clinicalTrials), services/ (anthropic.js, openai.js, genomicDatabases.js, llm.js, clinicalTrials.js), utils/ (auth, encryption, audit, cookies), prisma/
- `packages/shared/src/` — client.ts (ApiClient), types.ts, schemas.ts (Zod)
- `functions/` — 18 stale Base44 Deno edge functions (admin/billing) ← only remaining Base44 dependency

## Where things live
| Task | Location |
|---|---|
| Auth | `services/api/src/routes/auth.js` + middleware/util `auth.js` |
| DB schema | `services/api/prisma/schema.prisma` (User, Session, Subscription, InstitutionalLicense, AuditLog) |
| Migrations | `services/api/prisma/migrations/0_init/` (single init; dev uses `db:push`) |
| Env vars | `services/api/src/config/env.js` (Zod): DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, STRIPE_SECRET_KEY |
| AI | `services/api/src/services/anthropic.js` + `openai.js` (POST from `routes/llm.js`) |
| Shared client | `packages/shared/src/client.ts` |
| Stripe webhooks | `routes/billing.js` `/stripe/webhook` (idempotent via StripeEvent table) |

## Gotchas
- **Base44 only in `functions/`:** all 18 files still `import @base44/sdk@0.8.4` (Deno). Backend `services/api` is 100% Base44-free; frontend is too. These are stale admin/billing functions.
- **Single Prisma migration** (`0_init/`); schema changes via `pnpm db:push` in dev, `db:migrate:deploy` in prod/CI.
- **API baseURL fallback** in `client.ts` (~line 60): `VITE_API_URL` → `localhost:3000` → `""` (empty = reverse-proxy; on Vercel `/api/*` rewrites to Railway).
- **Medical data encryption:** `MEDICAL_DATA_ENCRYPTION_KEY` must be 64-char hex (AES-256-GCM) in prod; stored in `MedicalData.encryptedContent` (BYTEA).
- Missing Stripe price-id envs silently checkout against wrong product (env.js warns, doesn't fail).
- InstitutionalLicense / LicenseAssignment models exist but UI is ~50% wired (draft).
