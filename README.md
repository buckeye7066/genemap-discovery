# GeneMap Discovery

A genomic analysis platform for discovering candidate genes, analyzing genetic variants, and exploring population data.

## Architecture

This is a pnpm-workspaces monorepo containing:

- **apps/web**: React frontend (Vite + TailwindCSS + Shadcn UI)
- **apps/desktop**: Electron desktop shell for the web app
- **services/api**: Node.js backend (Fastify + Prisma + PostgreSQL)
- **packages/shared**: Shared types, schemas, and API client

## Migration Status

Active migration from Base44 to Railway + Vercel + Postgres + Stripe.

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

### In Progress

- Production deployment
- E2E testing with Playwright
- Ongoing hardening of genomics privacy and scientific-safety flows

See [docs/MIGRATION_OFF_BASE44.md](docs/MIGRATION_OFF_BASE44.md) for migration details.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 16+

### Installation

```bash
pnpm install
cp services/api/.env.example services/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit the `.env` files with local development values before starting the app.

### Development

```bash
# Start database, if using Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=genemap postgres:16

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

### Genomics

- Authenticated public-database proxies for variants, genes, ClinVar, and HPO terms
- Deterministic VCF parsing through the API
- Source-grounded VCF enrichment using public database lookups
- Raw VCF content is not sent to cloud LLMs by default
- Research and education only; not diagnostic or medical advice

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

### Genomics

- `GET /genomics/variant/search`
- `GET /genomics/variant/:id`
- `GET /genomics/gene/:symbol`
- `GET /genomics/clinvar/search`
- `GET /genomics/phenotype/search`
- `POST /genomics/vcf/parse`
- `POST /genomics/vcf/enrich`

### Health

- `GET /health`
- `GET /healthz`
- `GET /readyz`

## Database Schema

See [services/api/prisma/schema.prisma](services/api/prisma/schema.prisma) for the complete schema.

Key models include `User`, `Session`, `Subscription`, `InstitutionalLicense`, `LicenseAssignment`, `AuditLog`, `StripeEvent`, `ConsentRecord`, `DataDeletionRequest`, and `MedicalData`.

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
```

## Contributing

1. Create a feature branch.
2. Make changes.
3. Run `pnpm lint`, `pnpm typecheck`, and relevant tests.
4. Submit a PR with verification notes.

## License

Proprietary - All rights reserved.
