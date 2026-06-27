# Release Gates Checklist

Before deploying to production, all gates must pass.

## Gate 1: Code Quality

### Linting
```bash
pnpm lint
```
- [ ] No ESLint errors
- [ ] No ESLint warnings (or documented exceptions)

### Type Checking
```bash
pnpm typecheck
```
- [ ] No TypeScript errors
- [ ] All types properly defined

### Code Review
- [ ] At least one peer review completed
- [ ] All review comments addressed
- [ ] No unresolved discussions

## Gate 2: Testing

### Unit Tests
```bash
pnpm test
```
- [ ] All unit tests passing
- [ ] Code coverage ≥ 70% for critical paths
- [ ] New features have tests

### Integration Tests
```bash
pnpm test:api:integration
```
- [ ] API integration tests passing
- [ ] PostgreSQL-backed integration tests passing with `TEST_DB=postgres`
- [ ] Database migrations tested with `pnpm db:migrate:deploy`
- [ ] Authentication flows verified
- [ ] Stripe webhook idempotency verified against real unique constraints

### E2E Tests
```bash
pnpm test:e2e
```
- [ ] Playwright tests passing
- [ ] Critical user journeys covered:
  - [ ] User registration
  - [ ] User login
  - [ ] Premium upgrade (self-test mode)
  - [ ] Institutional checkout (self-test mode)
  - [ ] Premium feature gating

## Gate 3: Security

### Dependency Audit
```bash
pnpm audit
```
- [ ] No high/critical vulnerabilities
- [ ] No production dependency vulnerabilities at moderate severity or above
- [ ] Dependabot is enabled for npm, GitHub Actions, and Docker updates
- [ ] Known development-only vulnerabilities have mitigation plan

### Secret Management
- [ ] No secrets in code or committed files
- [ ] All secrets in environment variables
- [ ] `.env.example` files updated
- [ ] Production secrets rotated

### Authentication & Authorization
- [ ] JWT tokens properly secured
- [ ] Refresh token rotation working
- [ ] RBAC enforced on all endpoints
- [ ] Rate limiting configured

### Input Validation
- [ ] All inputs validated with Zod
- [ ] SQL injection prevented (Prisma ORM)
- [ ] XSS prevention verified

### Genomic Data & AI Safety
- [ ] Raw VCF uploads use deterministic parsing by default
- [ ] Raw VCF/genomic-looking content is rejected by LLM routes unless `ALLOW_GENOMIC_LLM_UPLOAD=true`
- [ ] LLM genomic upload consent type/version and audit logging reviewed before enabling
- [ ] VCF parse/enrich tests enforce payload size and batch limits

## Gate 4: Database

### Schema Validation
```bash
pnpm db:generate
```
- [ ] Prisma schema valid
- [ ] All models have proper relations
- [ ] Indexes defined for query performance

### Migration Testing
```bash
pnpm db:migrate
```
- [ ] Migrations run successfully on staging
- [ ] Data integrity maintained
- [ ] Rollback tested

### Backup Verification
- [ ] Automated backups configured
- [ ] Backup restoration tested
- [ ] Backup retention policy set

## Gate 5: Deployment

### Environment Configuration
- [ ] All environment variables documented
- [ ] Runtime uses supported Node.js 24+ image/runtime
- [ ] Staging environment matches production
- [ ] CORS origins configured correctly
- [ ] Stripe keys (test/live) configured per environment

### Infrastructure
- [ ] Railway project created
- [ ] PostgreSQL provisioned
- [ ] Vercel project configured
- [ ] DNS records prepared

### Monitoring
- [ ] Error tracking configured
- [ ] Log aggregation working
- [ ] Health check endpoints responding
- [ ] Alerting rules defined

## Gate 6: Documentation

### Technical Documentation
- [ ] MIGRATION_OFF_BASE44.md complete
- [ ] DEPLOYMENT.md updated
- [ ] API endpoints documented
- [ ] Architecture diagrams current

### Operational Documentation
- [ ] Runbook created
- [ ] Rollback procedure documented
- [ ] Incident response plan ready
- [ ] On-call rotation defined

### User Documentation
- [ ] Premium features documented
- [ ] Institutional licensing guide ready
- [ ] FAQ updated
- [ ] Support contact information current

## Gate 7: Business Continuity

### Rollback Plan
- [ ] Rollback procedure documented
- [ ] Rollback tested on staging
- [ ] Prior Railway/Vercel release rollback tested
- [ ] Database backup restoration path tested
- [ ] DNS TTL reduced for quick failover

### Data Migration
- [ ] Migration scripts tested
- [ ] Data validation queries prepared
- [ ] User notification plan ready
- [ ] Migration timeline communicated

### Monitoring & Alerting
- [ ] Critical alerts configured
- [ ] Escalation paths defined
- [ ] Dashboard created
- [ ] On-call schedule set

## Gate 8: Stakeholder Approval

### Technical Approval
- [ ] Engineering lead sign-off
- [ ] Security team review complete
- [ ] DevOps approval obtained

### Business Approval
- [ ] Product owner approval
- [ ] Compliance review (if required)
- [ ] Legal review (if required)

### Communication
- [ ] Internal stakeholders notified
- [ ] Customer communication prepared
- [ ] Support team briefed
- [ ] Marketing aligned (if user-facing)

## Pre-Deploy Final Checks

Execute 24 hours before cutover:

```bash
# Run full test suite
pnpm test && pnpm test:api:integration && pnpm test:e2e

# Verify builds
pnpm build

# Check for security issues
pnpm audit

# Validate database
pnpm db:generate && pnpm db:migrate:deploy

# Test staging environment
curl https://staging-api.yourdomain.com/health
curl https://staging.yourdomain.com
```

- [ ] All checks passing
- [ ] Staging environment stable for 24+ hours
- [ ] Load testing completed (if applicable)
- [ ] Performance benchmarks met

## Post-Deploy Validation

Execute immediately after cutover:

```bash
# Health checks
curl https://api.yourdomain.com/health

# Auth flow
curl -X POST https://api.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Premium checkout (self-test)
# (requires auth token from above)
```

- [ ] API responding
- [ ] Database accessible
- [ ] Authentication working
- [ ] Billing endpoints responding
- [ ] Frontend loading
- [ ] Monitoring showing green status

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| DevOps | | | |
| Security | | | |
| Product Owner | | | |

## Emergency Contacts

- On-Call Engineering: [Phone/Slack]
- DevOps: [Phone/Slack]
- Database Admin: [Phone/Slack]
- Incident Commander: [Phone/Slack]

## Notes

[Add any additional notes or context here]
