# GeneMap Discovery

A comprehensive genomic analysis platform for discovering candidate genes, analyzing genetic variants, and exploring population data.

## Architecture

This is a monorepo containing:

- **apps/web**: React frontend (Vite + TailwindCSS + Shadcn UI)
- **services/api**: Node.js backend (Fastify + Prisma + PostgreSQL)
- **packages/shared**: Shared types, schemas, and API client

## Migration Status

🚧 **Active Migration**: Currently migrating from Base44 to Railway + Vercel + Postgres + Stripe.

### Completed
- ✅ Monorepo structure with pnpm workspaces
- ✅ Complete backend API with Fastify + Prisma
- ✅ JWT authentication (access + refresh tokens)
- ✅ Stripe billing integration (individual + institutional)
- ✅ Shared package with API client and schemas
- ✅ Frontend auth migration (no Base44 dependencies)
- ✅ Premium subscription flow
- ✅ Institutional licensing
- ✅ Complete documentation suite
- ✅ Backup scripts (Bash + PowerShell)
- ✅ GitHub Actions CI

### In Progress
- 🔄 Full Base44 feature migration (entities, integrations)
- 🔄 E2E testing with Playwright
- 🔄 Production deployment

See `docs/MIGRATION_OFF_BASE44.md` for complete migration details.

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8+
- PostgreSQL 16+

### Installation

```bash
# Install dependencies
pnpm install

# Setup environment variables
cp services/api/.env.example services/api/.env
cp apps/web/.env.example apps/web/.env

# Edit .env files with your values
```

### Development

```bash
# Start database (if using Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=genemap postgres:16

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Start backend API (terminal 1)
pnpm dev:api

# Start frontend (terminal 2)
pnpm dev:web

# Open browser
open http://localhost:5173
```

### Build

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build:api
pnpm build:web
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @genemap/shared test

# Run E2E tests (requires API running)
pnpm test:e2e
```

## Project Structure

```
genemap-discovery/
├── apps/
│   └── web/                 # React frontend
│       ├── components/      # React components
│       ├── pages/          # Page components
│       ├── lib/            # Utilities (AuthContext, etc.)
│       └── public/         # Static assets
├── services/
│   └── api/                # Backend API
│       ├── prisma/         # Database schema
│       ├── src/
│       │   ├── routes/     # API routes
│       │   ├── middleware/ # Auth, error handling
│       │   ├── services/   # Business logic
│       │   └── utils/      # Utilities
│       └── .env.example
├── packages/
│   └── shared/             # Shared code
│       ├── src/
│       │   ├── client.js   # API client
│       │   ├── schemas.js  # Zod schemas
│       │   └── types.js    # TypeScript types
│       └── __tests__/
├── docs/                   # Documentation
│   ├── MIGRATION_OFF_BASE44.md
│   ├── DEPLOYMENT.md
│   ├── RELEASE_GATES.md
│   ├── CUTOVER_CHECKLIST.md
│   └── BACKUP.md
├── scripts/                # Utility scripts
│   ├── backup-snapshot.sh
│   └── backup-snapshot.ps1
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions CI
├── pnpm-workspace.yaml     # Workspace config
└── package.json            # Root package.json
```

## Key Features

### Authentication
- JWT-based auth with httpOnly cookies
- Access tokens (15 min) + refresh tokens (7 days)
- RBAC (admin/user roles)
- Rate limiting on auth endpoints

### Billing
- Individual subscriptions ($9.99/month)
- Institutional licenses (volume discounts)
- Stripe webhook integration
- Self-test mode for testing without Stripe

### Premium Features
- Population prevalence data
- Gene evolutionary history
- Mutation data
- Treatment information
- Enhanced AI insights

## Environment Variables

### Backend (services/api/.env)
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

### Frontend (apps/web/.env)
```env
VITE_API_URL=http://localhost:3000
```

## Documentation

- [Migration Guide](docs/MIGRATION_OFF_BASE44.md) - Complete migration documentation
- [Deployment Guide](docs/DEPLOYMENT.md) - Railway + Vercel deployment
- [Release Gates](docs/RELEASE_GATES.md) - Pre-deployment checklist
- [Cutover Plan](docs/CUTOVER_CHECKLIST.md) - Production cutover steps
- [Backup Guide](docs/BACKUP.md) - Backup and recovery procedures

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/logout` - Logout user
- `GET /auth/me` - Get current user with entitlements

### Billing
- `POST /billing/checkout-session` - Create individual checkout
- `POST /billing/portal-session` - Open customer portal
- `POST /billing/institutional-checkout` - Create institutional checkout
- `POST /billing/webhook` - Stripe webhook handler

### Health
- `GET /health` - API health check

## Database Schema

See `services/api/prisma/schema.prisma` for the complete schema.

Key models:
- **User**: User accounts with password hash
- **Session**: Refresh token storage
- **Subscription**: Stripe subscription tracking
- **InstitutionalLicense**: Organization licenses
- **LicenseAssignment**: User assignments to licenses
- **AuditLog**: Audit trail for all operations
- **StripeEvent**: Idempotency for webhooks

## Scripts

```bash
# Workspace commands
pnpm dev              # Start all dev servers
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm lint             # Lint frontend
pnpm typecheck        # TypeScript type checking

# Database commands
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to database
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Prisma Studio

# Backup
./scripts/backup-snapshot.sh           # Bash
./scripts/backup-snapshot.ps1          # PowerShell
```

## Contributing

1. Create a feature branch
2. Make changes
3. Run tests: `pnpm test`
4. Run linter: `pnpm lint`
5. Submit PR

## License

Proprietary - All rights reserved

## Support

For support, contact: [Add contact information]

## Roadmap

- [ ] Complete Base44 entity migration
- [ ] Complete Base44 integration migration  
- [ ] E2E test suite
- [ ] Production deployment
- [ ] Monitoring and alerting
- [ ] Performance optimization
