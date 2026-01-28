# Migration Off Base44 - Architecture Guide

## Overview
This document outlines the complete migration of GeneMap Discovery from Base44 to a Railway + Vercel + Postgres + Stripe architecture.

## Previous Architecture (Base44)

### Dependencies Removed
- `@base44/sdk@^0.8.3` - Authentication, entities, and API client
- `@base44/vite-plugin@^0.2.0` - Vite integration for Base44

### Base44 Services Used
- **Authentication**: OAuth-based login via Base44 platform
- **Database**: Managed Postgres through Base44 entities
- **Functions**: Serverless functions in `/functions` directory
- **Billing**: Stripe integration through Base44 proxies

## New Architecture

### Stack Components

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Vercel)                     │
│  apps/web - Vite + React + TailwindCSS + Shadcn UI     │
│  - Uses @genemap/shared for API calls                   │
│  - No Base44 dependencies                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTP + Cookies (httpOnly)
                     │
┌────────────────────▼────────────────────────────────────┐
│               Backend API (Railway)                      │
│  services/api - Node.js + Fastify + Prisma             │
│  - JWT access + refresh tokens                          │
│  - RBAC (admin/user roles)                              │
│  - Stripe webhooks                                       │
└────────────────────┬────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼────┐    ┌────▼────┐    ┌────▼────┐
│ Postgres│    │ Stripe  │    │  DNS    │
│(Railway)│    │  API    │    │(GoDaddy)│
└─────────┘    └─────────┘    └─────────┘
```

### Data Model (Prisma Schema)

#### Core Models
- **User**: Email, password hash, role (user/admin)
- **Session**: Refresh token hashes, expiry tracking
- **Subscription**: Stripe customer/subscription IDs, status, plan type
- **InstitutionalLicense**: Organization licenses with seat management
- **LicenseAssignment**: User assignments to institutional licenses
- **LicenseUsageLog**: Audit trail for license usage
- **AuditLog**: System-wide audit logging
- **StripeEvent**: Idempotency tracking for webhooks

### Authentication Flow

1. **Registration/Login**
   - POST `/auth/register` or `/auth/login`
   - Server validates credentials with bcrypt
   - Generates JWT access token (15min) + refresh token (7 days)
   - Sets httpOnly cookies for both tokens
   - Returns user object with entitlements

2. **Authorization**
   - Each request includes cookies automatically
   - Middleware verifies access token
   - Expired tokens rejected with 401

3. **Entitlements Check**
   - GET `/auth/me` returns user with `entitlements.isPremium`
   - Checks active subscriptions OR institutional license
   - Frontend gates premium features based on this flag

### Billing Integration

#### Individual Subscriptions
- POST `/billing/checkout-session` - Creates Stripe Checkout
- POST `/billing/portal-session` - Opens customer portal
- Webhook handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

#### Institutional Licenses
- POST `/billing/institutional-checkout` - Multi-seat checkout
- Pricing tiers:
  - Team: $7.99/month or $79.99/year per user
  - Department: $6.99/month or $69.99/year per user
  - Enterprise: $5.99/month or $59.99/year per user
- Minimum 5 seats

#### Self-Test Mode
All billing endpoints support `_selfTest: true` in request body:
- Returns mock session IDs
- No actual Stripe API calls
- Enables testing without Stripe setup

### Deployment Strategy

#### Phase 1: Parallel Run (Current)
- Base44 production remains live
- New stack deployed to staging
- Data migration scripts prepared

#### Phase 2: Data Migration
- Export users from Base44
- Import to new Postgres
- Migrate active subscriptions
- Verify integrity

#### Phase 3: Cutover
- Update DNS to point to new stack
- Monitor error rates
- Base44 maintained as fallback for 30 days

#### Phase 4: Decommission
- Verify no traffic to Base44
- Archive Base44 data
- Remove Base44 accounts

### Security Considerations

1. **Secrets Management**
   - All secrets in environment variables
   - Never logged or exposed in errors
   - Separate secrets per environment

2. **CORS Configuration**
   - Whitelist origins via `CORS_ORIGINS` env var
   - Credentials enabled for cookies
   - Rejects unknown origins

3. **Rate Limiting**
   - Auth endpoints: 10 requests / 15 minutes
   - General API: 100 requests / 15 minutes

4. **Input Validation**
   - Zod schemas for all requests
   - SQL injection prevention via Prisma
   - XSS prevention via React

### Monitoring & Observability

1. **Logging**
   - Fastify request/response logging
   - Audit logs for all mutations
   - Error sanitization (no secrets)

2. **Metrics** (To be implemented)
   - API response times
   - Error rates by endpoint
   - Authentication success/failure rates

3. **Alerts** (To be implemented)
   - Webhook processing failures
   - Database connection issues
   - High error rates

## Cutover Plan

### Pre-Cutover Checklist
- [ ] All tests passing
- [ ] Staging environment validated
- [ ] Data migration tested
- [ ] DNS records prepared
- [ ] Rollback plan documented
- [ ] Team notified

### Cutover Steps
1. Enable maintenance mode on Base44
2. Export final data snapshot
3. Import to new Postgres
4. Update DNS A/CNAME records
5. Monitor for 15 minutes
6. Disable maintenance mode
7. Confirm traffic flowing

### Rollback Procedure
1. Revert DNS changes
2. Re-enable Base44
3. Investigate issues
4. Schedule retry

## Support Contacts
- DevOps: [Add contact]
- Database: [Add contact]
- Billing: [Add contact]
