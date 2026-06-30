# CLAUDE.md - GeneMap Discovery

Genomic analysis platform. pnpm-workspaces monorepo migrated off Base44.

## Tech Stack

React 18 + Vite + Tailwind + Radix (`apps/web`), Electron (`apps/desktop`), Fastify 5.8 + Prisma 6.2 + PostgreSQL 18 (prod on Railway; CI tests against postgres:18) (`services/api`), shared TypeScript package (`packages/shared`), Anthropic/OpenAI wrappers, Stripe, JWT access/refresh tokens, bcrypt, and HTTP-only cookies.

## Run / Build / Test

```bash
pnpm dev              # API + web
pnpm dev:api          # Fastify API on :3000
pnpm dev:web          # Vite web app on :5173
pnpm dev:desktop      # Electron shell
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm db:push
pnpm db:migrate
pnpm db:migrate:deploy
pnpm db:studio
```

## Entry Points

- Frontend: `apps/web/main.jsx` -> `App.jsx`
- Backend: `services/api/src/index.js`
- Desktop: `apps/desktop/main.js`
- Shared: `packages/shared/src/index.ts`

## Directory Map

- `apps/web/` - main React app, pages, components, AuthContext, QueryClient
- `apps/desktop/` - Electron desktop shell that loads the built web app
- `services/api/src/` - Fastify bootstrap, config, middleware, routes, services, utils
- `services/api/prisma/` - schema and migrations
- `packages/shared/src/` - ApiClient, schemas, and shared types
- `docs/audits/` - historical point-in-time audit reports

## Where Things Live

| Task | Location |
|---|---|
| Auth | `services/api/src/routes/auth.js` + `services/api/src/middleware/auth.js` |
| DB schema | `services/api/prisma/schema.prisma` |
| Env vars | `services/api/src/config/env.js` |
| AI wrappers | `services/api/src/services/anthropic.js`, `openai.js`, `llm.js` |
| Genomics | `services/api/src/routes/genomics.js`, `services/api/src/services/genomicDatabases.js`, `vcf.js` |
| Shared client | `packages/shared/src/client.ts` |
| Stripe webhooks | `services/api/src/routes/billing.js` |

## Gotchas

- Base44 Deno functions have been removed from the active tree.
- `pnpm dev` starts API and web together; desktop is separate.
- API baseURL fallback in `client.ts`: `VITE_API_URL` -> localhost API in local browser -> same-origin proxy.
- Medical data encryption requires a 64-character hex `MEDICAL_DATA_ENCRYPTION_KEY` in production.
- Stripe price IDs must come from server env; do not trust client-supplied price IDs.
