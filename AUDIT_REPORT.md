# AUDIT_REPORT — GeneMap Discovery

Branch: `fix/genemap-discovery-audit-ux-repair`. Date: 2026-06-23.

## Architecture
pnpm-workspaces monorepo, ~98% migrated off Base44:
- **apps/web** — React 18 + Vite + TS-checked JSX + Tailwind/Radix. Router +
  React Query + AuthProvider. `mainPage: LearnGenetics`.
- **services/api** — Node + Fastify 5.8 + Prisma 6.2 + PostgreSQL 16. Routes:
  auth, billing, education, llm, admin, entities, genomics, clinicalTrials.
- **packages/shared** — TS `ApiClient` + types + Zod schemas (built to dist).
- **apps/desktop** — Electron 35 wrapper bundling `apps/web/dist`.
- **functions/** — 18 stale Base44 Deno edge functions (the only remaining Base44
  dependency; not in the runtime path).

## Backend routes (surface)
auth (register/login/logout/refresh/me), billing (checkout/portal/institutional/
stripe-webhook), education (topics/explain/image/quiz/chat/progress/entitlements),
llm (invoke/chat/image), admin (users/search/banned/ban/unban/pre-ban/grant-
premium/grant-admin/analytics/messages/delete), entities (search-history/activity/
medical-data/conversations/gene-sets/projects[+versions/collaborators/annotations]/
messages/licenses[+assign]/consent/data-deletion-request), genomics (variant/gene/
clinvar/phenotype), clinical-trials (search/get).

## Frontend page map (intent groups, post-redesign)
- **Learn**: LearnGenetics, TopicExplorer, LearningPath, QuizMode
- **Discover**: Home, Search, AIAssistants, Anastasia
- **Research**: Dashboard, GSEA, VCFAnalysis, VisualizationHub, ResearchMode, RobertClinical
- **My Data**: MedicalData, History
- **Account**: Profile, Premium, ContactSupport
- **Admin (role-gated)**: InstitutionalAdmin, AdminAnalytics, UsersLog, AdminMessages,
  BannedUsers, AxiomNewsletter, AdminFunctionTester, FunctionReviewer, SuperAdminSetup

## Authentication / CSRF
JWT access (15m) + refresh (7d, rotated on use), bcrypt, httpOnly cookies. CSRF =
HMAC double-submit token bound to userId, applied globally, exempting safe methods,
auth login/register/refresh, and the Stripe webhook. Client injects `X-CSRF-Token`.

## AI / data integrations
Anthropic Claude + OpenAI (lazy-loaded) behind `services/llm.js`; usage metered
per-user per-day via `entitlements` middleware. Genomic data from MyVariant,
Ensembl, NCBI ClinVar, HPO (JAX) — cached (TTL+LRU), now with retry/backoff.
Medical data AES-256-GCM encrypted at rest (fail-closed in prod), consent-gated.

## Migration status (Base44 → Railway/Vercel/Postgres/Stripe)
Backend + shared client 100% Base44-free. Frontend was *mostly* migrated but
several pages still emitted/read Base44 snake_case entity fields — the principal
class of bug this audit fixed (search-history, gene-set save, history display).
`functions/` remains Base44 Deno and is out of the runtime path.

## Top 10 Risks — Before Repair
1. Search history silently never saved (snake_case body → 400, swallowed).
2. Gene sets could not be saved from search (wrong endpoint → 400/403).
3. History page rendered blank rows (snake_case field reads).
4. ~1,880 lines of security/contract fixes **uncommitted & unvalidated** on main.
5. Admin nav exposed to all users; super-admin tools not segregated in UI.
6. Collaborator `role` accepted arbitrary strings (privilege injection).
7. Duplicate license seats / seat-counter underflow possible.
8. Desktop build hard-fails (no icon assets); PWA icons 404.
9. LLM input unbounded (cost/DoS); fragile per-call-site JSON parsing.
10. Genomic lookups had no retry and case-sensitive cache keys.

## Top 10 Risks — After Repair
1. **Unbounded entities request bodies** (genes/messages/metadata) — add shared Zod. *(M)*
2. **No DB-level unique on active license seats** — app-enforced only. *(M)*
3. **No server-side session pruning** — leaked refresh token valid until rotation/expiry. *(L)*
4. **LLM services lack provider retry/backoff** (genomics now has it). *(L)*
5. **Full WCAG 2.1 AA pass incomplete** (contrast, aria-labels, reduced-motion). *(L)*
6. **Medical content not explicitly redacted** from unexpected error paths. *(L)*
7. **API "typecheck" is shallow** (`node --check` on 2 files) — no real TS on backend. *(L)*
8. **Stripe price-id envs warn but don't fail** — misconfig checks against wrong product. *(L)*
9. **`functions/` still Base44** — dead but should be deleted to finish migration. *(L)*
10. **Gene-set save cache invalidation is a no-op** (SavedGeneSets isn't React-Query keyed) — set appears on next mount, not instantly. *(L)*

## What was validated
`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build:web`, `pnpm --filter @genemap/shared build`, icon generation +
binary validation. Desktop *packaging* (`electron-builder`) was not executed in
this environment (no signing/runner), but the blocker (missing icons) is fixed
and configuration verified statically.
