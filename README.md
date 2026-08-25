# GeneMap Discovery

An approachable genetics-education and early-research platform for reviewed learning topics and provenance-aware candidate-gene exploration.

The publishable build is education and exploratory research only. It does not accept personal medical records or VCF uploads and does not provide diagnosis, personal risk, pharmacogenomics, treatment, dosing, drug-avoidance, screening, urgency, or trial-matching guidance.

**[PROJECT-BRIEF.md](PROJECT-BRIEF.md) is the authoritative description of what this build ships.** Several capabilities exist in backend code but are switched off for publication; they are listed there in §5 with the reason each one is gated. Backend code existing is not a reason to enable a route.

## Architecture

This is a pnpm-workspaces monorepo containing:

- **apps/web**: React frontend (Vite + TailwindCSS + Shadcn UI)
- **apps/desktop**: Electron desktop shell for the web app
- **services/api**: Node.js backend (Fastify + Prisma + PostgreSQL)
- **packages/shared**: Shared types, schemas, and API client

## Migration Status

Migrated off Base44 to Railway + Vercel + Postgres + Stripe.

### Completed

- Monorepo structure with pnpm workspaces
- Complete backend API with Fastify + Prisma
- JWT authentication (access + refresh tokens)
- Stripe billing integration (individual + institutional)
- Shared package with API client and schemas
- Frontend auth migration (no Base44 dependencies)
- Premium subscription flow
- Institutional licensing
- Documentation suite
- Backup scripts (Bash + PowerShell)
- GitHub Actions CI
- Production deployment: API live on Railway (Docker, auto-deploys on merge to
  `main`), web on Vercel. See CLAUDE.md for the Railway source-connection note.

### In Progress

- E2E testing with Playwright
- Ongoing hardening of genomics privacy and scientific-safety flows

Deployment responsibilities: the **web** app (`apps/web`) ships to Vercel; the
**API** (`services/api`) ships to Railway as a Docker image with a Railway
PostgreSQL database; the **desktop** shell (`apps/desktop`, Electron) loads the
built web app and is distributed as a packaged binary, not part of the cloud
deploy. See [docs/MIGRATION_OFF_BASE44.md](docs/MIGRATION_OFF_BASE44.md) for
migration details and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the deploy runbook.

## Quick Start

### Prerequisites

- Node.js 24+
- pnpm 9 (managed via corepack; pinned by the root `packageManager` field)
- PostgreSQL 18 (production and CI run PostgreSQL 18)

### Installation

```bash
pnpm install
cp services/api/.env.example services/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit the `.env` files with local development values before starting the app.

### Development

```bash
# Start database, if using Docker (match the production/CI major version)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=genemap postgres:18

# Generate Prisma client and prepare the development schema
pnpm db:generate
pnpm db:push

# Start API and web app together
pnpm dev

# Or run them separately
pnpm dev:api
pnpm dev:web
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
pnpm build
pnpm build:api
pnpm build:web
pnpm build:desktop
```

## Testing

```bash
pnpm test
pnpm test:api
pnpm test:shared
pnpm lint
pnpm typecheck
pnpm audit
```

## Project Structure

```text
genemap-discovery/
├── apps/
│   ├── web/                  # React frontend
│   │   ├── components/
│   │   ├── pages/
│   │   ├── lib/
│   │   └── public/
│   └── desktop/              # Electron desktop shell
├── services/
│   └── api/                  # Fastify + Prisma backend
│       ├── prisma/
│       └── src/
│           ├── routes/
│           ├── middleware/
│           ├── services/
│           └── utils/
├── packages/
│   └── shared/               # Shared API client, schemas, and types
├── docs/
│   ├── audits/               # Historical point-in-time reports
│   ├── MIGRATION_OFF_BASE44.md
│   ├── DEPLOYMENT.md
│   ├── RELEASE_GATES.md
│   ├── CUTOVER_CHECKLIST.md
│   └── BACKUP.md
├── scripts/
├── .github/workflows/
├── pnpm-workspace.yaml
└── package.json
```

## Key Features

### Authentication

- JWT-based auth with HTTP-only cookies
- Access tokens (15 min) + refresh tokens (7 days)
- RBAC (admin/user roles)
- Rate limiting on auth endpoints

### Billing

- Individual subscriptions
- Institutional licenses
- Stripe webhook integration with idempotency
- Self-test mode for non-Stripe test runs

### Genetics education and early research

- Reviewed genetics-topic catalog and bounded tutor tasks
- Candidate-gene and phenotype lookup with explicit source links
- Human, model-organism, and computational evidence are labeled separately where available
- Personal medical-data, variant/ClinVar, VCF, clinical-trial, and persona-routed AI paths return the publication-boundary response before handlers run
- Research and education only; not diagnostic, treatment, or medication advice

### Premium Features

Premium access is enforced server-side where applicable. Public genomics database lookups are authenticated baseline features unless a route explicitly adds an entitlement check.

## Environment Variables

### Backend (`services/api/.env`)

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/genemap
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
COOKIE_SECRET=your-cookie-secret
CORS_ORIGINS=http://localhost:5173
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NODE_ENV=development
```

### Frontend (`apps/web/.env`)

```env
VITE_API_URL=http://localhost:3000
```

## Documentation

- [Migration Guide](docs/MIGRATION_OFF_BASE44.md) - migration documentation
- [Deployment Guide](docs/DEPLOYMENT.md) - Railway + Vercel deployment
- [Release Gates](docs/RELEASE_GATES.md) - pre-deployment checklist
- [Production Launch Verification](docs/PRODUCTION_LAUNCH.md) - final secrets, backup, monitoring, Stripe, retention, and sign-off gate
- [Data Retention Policy](docs/DATA_RETENTION.md) - production retention baseline for health-adjacent data
- [Cutover Plan](docs/CUTOVER_CHECKLIST.md) - production cutover steps
- [Backup Guide](docs/BACKUP.md) - backup and recovery procedures
- [Historical Audits](docs/audits/README.md) - archived point-in-time audit reports

## API Endpoints

### Authentication

- `POST /auth/register` - register a new user
- `POST /auth/login` - login user
- `POST /auth/logout` - logout user
- `GET /auth/me` - get current user with entitlements

### Billing

- `POST /billing/checkout-session` - create individual checkout
- `POST /billing/portal-session` - open customer portal
- `POST /billing/institutional-checkout` - create institutional checkout
- `POST /billing/webhook` - Stripe webhook handler

### Genetics education (model-invoking)

- `GET /education/topics` - reviewed topic catalog (no model)
- `POST /education/explain` - catalog topic only; server owns the task
- `POST /education/quiz` - catalog topic only; server owns the task
- `POST /education/chat` - bounded tutor; structured `genetics_education` task
- `GET`/`POST /education/progress`, `GET /education/entitlements` (no model)

### Structured research generation

- `POST /llm/invoke` - the only general generation route. Accepts a versioned
  structured task (`aggregate_genomics_research`, `candidate_gene_research`,
  `research_hypothesis`, `learning_activity_summary`) and rejects raw prompt
  text, message histories, and any body key outside
  `{publicationTask, taskInput, options}`.

### Published genetics lookup

- `GET /genomics/publication-concepts/search` - deterministic curated HPO/MONDO search
- `GET /genomics/phenotype/search` - HPO phenotype search
- `POST /genomics/enrich` - MyGene.info/Ensembl/NCBI gene records + HPO validation
- `POST /genomics/association-evidence` - source-labelled association tuples

### Gated in the published build

- `GET /genomics/gene/:symbol` - **off** unless `GENOMICS_GENE_LOOKUP_ENABLED=true`;
  the handler returns "Gene lookup is disabled on this deployment".
- `POST /education/image` - always returns an `unavailable` artifact
  (`image_output_verification_unavailable`); it never invokes a model.
- `POST /llm/chat`, `POST /llm/image` - retired stubs; 403 at the publication
  boundary before the handler runs.

Variant, ClinVar, VCF, medical-data, conversation, and clinical-trial routes are intentionally unavailable in the education/research publication mode: they return `404 FEATURE_NOT_AVAILABLE` from an `onRequest` hook, before authentication. See [PROJECT-BRIEF.md §5](PROJECT-BRIEF.md#5-gated-capabilities-present-in-code-off-in-the-published-build) for the full gated list and the reason for each.

### Health

- `GET /health`
- `GET /healthz`
- `GET /readyz`

## Database Schema

See [services/api/prisma/schema.prisma](services/api/prisma/schema.prisma) for the complete schema.

Key active models include `User`, `Session`, `Subscription`, `InstitutionalLicense`, `LicenseAssignment`, `AuditLog`, `StripeEvent`, `ConsentRecord`, and `DataDeletionRequest`. Legacy clinical-era tables remain migration/retention concerns and are not publishable product features.

## Scripts

```bash
pnpm dev              # Start API + web dev servers
pnpm dev:api          # Start Fastify API
pnpm dev:web          # Start Vite web app
pnpm dev:desktop      # Start Electron desktop shell
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm lint             # Lint web + API
pnpm typecheck        # Type checking / node checks
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to development database
pnpm db:migrate       # Create/run a Prisma migration
pnpm db:migrate:deploy
pnpm db:studio
pnpm launch:verify    # Verify production env, evidence, health, readiness, and web launch checks
```

## Contributing

1. Create a feature branch.
2. Make changes.
3. Run `pnpm lint`, `pnpm typecheck`, and relevant tests.
4. Submit a PR with verification notes.

## License

Proprietary - All rights reserved.
