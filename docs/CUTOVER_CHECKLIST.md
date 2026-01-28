# Cutover Checklist

## Pre-Cutover (T-7 days)

### Week Before
- [ ] Final code freeze announced
- [ ] Staging environment validated
- [ ] Load testing completed
- [ ] Backup strategy verified
- [ ] Rollback plan reviewed
- [ ] Team training completed
- [ ] Customer notification drafted

## Pre-Cutover (T-24 hours)

### Day Before
- [ ] All release gates passed (see RELEASE_GATES.md)
- [ ] Production environment ready
- [ ] DNS TTL reduced to 300 seconds
- [ ] Monitoring dashboards configured
- [ ] Alert escalation paths tested
- [ ] On-call engineers confirmed
- [ ] Stakeholder communication sent

### Final Checks
```bash
# Verify all tests pass
pnpm test && pnpm test:integration && pnpm test:e2e

# Verify builds succeed
pnpm build

# Check staging stability
curl https://staging-api.railway.app/health
```

## Cutover Window (T-0)

### Phase 1: Preparation (15 minutes)

**T-15min: Enable Maintenance Mode**
- [ ] Display maintenance banner on Base44 site
- [ ] Stop accepting new Base44 registrations
- [ ] Log all active sessions

**T-10min: Final Backup**
```bash
# Run backup scripts
./scripts/backup-snapshot.sh
```
- [ ] Backup completed successfully
- [ ] Verify backup file created
- [ ] Upload backup to secure storage

**T-5min: Data Export**
```bash
# Export users from Base44
# (Script to be provided by Base44 team)
```
- [ ] User data exported
- [ ] Subscription data exported
- [ ] License data exported
- [ ] Verify export file integrity

### Phase 2: Migration (30 minutes)

**T+0min: Database Import**
```bash
# Connect to Railway Postgres
railway connect

# Import data
psql $DATABASE_URL < data-export.sql
```
- [ ] Users imported
- [ ] Passwords migrated (will need reset)
- [ ] Subscriptions imported
- [ ] Licenses imported
- [ ] Data integrity verified

**T+10min: Stripe Sync**
```bash
# Run Stripe sync script
node scripts/sync-stripe-subscriptions.js
```
- [ ] Stripe subscriptions matched
- [ ] Customer IDs verified
- [ ] Webhook history reviewed

**T+20min: Verification Queries**
```sql
-- Count users
SELECT COUNT(*) FROM users;

-- Count active subscriptions
SELECT COUNT(*) FROM subscriptions WHERE status IN ('active', 'trialing');

-- Count active licenses
SELECT COUNT(*) FROM institutional_licenses WHERE status = 'active';

-- Check audit log
SELECT COUNT(*) FROM audit_log;
```
- [ ] User counts match export
- [ ] Subscription counts match
- [ ] License counts match
- [ ] No data loss detected

### Phase 3: DNS Cutover (15 minutes)

**T+30min: Update DNS Records**

GoDaddy DNS Changes:
```
Before:
A       @       <Base44 IP>         600
CNAME   www     <Base44 CNAME>      600

After:
A       @       76.76.21.21         600
CNAME   www     cname.vercel-dns.com 600
```

- [ ] DNS records updated in GoDaddy
- [ ] Propagation started
- [ ] Time logged: __________

**T+35min: Verify DNS Propagation**
```bash
# Check DNS resolution
dig yourdomain.com +short
dig www.yourdomain.com +short

# Test from multiple locations
curl -I https://yourdomain.com
```
- [ ] DNS resolving to new IP
- [ ] WWW subdomain working
- [ ] SSL certificate valid

**T+40min: Monitor Traffic**
- [ ] Traffic flowing to new infrastructure
- [ ] Railway API receiving requests
- [ ] Vercel serving frontend
- [ ] No error spike in logs

### Phase 4: Validation (30 minutes)

**T+45min: Smoke Tests**
```bash
# Health check
curl https://yourdomain.com/api/health

# Register test user
curl -X POST https://yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"cutover-test@example.com","password":"TestPass123!"}'

# Login test user
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cutover-test@example.com","password":"TestPass123!"}'

# Premium checkout (self-test mode)
curl -X POST https://yourdomain.com/api/billing/checkout-session \
  -H "Content-Type: application/json" \
  -H "Cookie: accessToken=<token>" \
  -d '{"plan":"monthly","successUrl":"https://yourdomain.com/success","cancelUrl":"https://yourdomain.com","_selfTest":true}'
```

**Critical Path Testing**
- [ ] User registration working
- [ ] User login working
- [ ] Auth persistence working
- [ ] Premium gating working
- [ ] Checkout flow working (self-test)
- [ ] Institutional checkout working (self-test)
- [ ] Customer portal accessible

**T+60min: User Acceptance**
- [ ] Internal team tested all flows
- [ ] Sample of migrated users able to log in
- [ ] Premium features accessible to subscribers
- [ ] No major issues reported

### Phase 5: Monitoring (2 hours)

**T+75min: Extended Monitoring**
- [ ] API response times normal (<200ms p95)
- [ ] Error rate <1%
- [ ] Database connections healthy
- [ ] Stripe webhooks processing
- [ ] No authentication failures

**T+120min: Stability Confirmation**
- [ ] System stable for 2+ hours
- [ ] No critical alerts
- [ ] Traffic patterns normal
- [ ] User feedback positive

## Post-Cutover (T+2 hours)

### Success Criteria Met
- [ ] All critical paths tested
- [ ] Error rate within SLA
- [ ] No data loss
- [ ] User migration successful
- [ ] Billing integration working

### Communications
- [ ] Internal team notified of success
- [ ] Stakeholders informed
- [ ] Customer communication sent
- [ ] Support team updated

### Base44 Cleanup
- [ ] Base44 marked as read-only
- [ ] Base44 redirect configured (if possible)
- [ ] Base44 webhook disabled
- [ ] Base44 access restricted

## Rollback Procedure (If Needed)

**Decision Point: T+30min or T+60min**

If critical issues detected:

### Step 1: Stop Traffic (5 minutes)
```bash
# Revert DNS to Base44
# In GoDaddy, change:
A       @       <Base44 IP>         60
CNAME   www     <Base44 CNAME>      60
```
- [ ] DNS reverted
- [ ] Traffic returning to Base44
- [ ] Base44 serving requests

### Step 2: Re-enable Base44 (5 minutes)
- [ ] Remove maintenance mode
- [ ] Re-enable registrations
- [ ] Verify Base44 operational

### Step 3: Notify & Document (15 minutes)
- [ ] Team notified of rollback
- [ ] Stakeholders informed
- [ ] Issues documented
- [ ] Postmortem scheduled

### Step 4: Investigate
- [ ] Collect logs from Railway
- [ ] Review error traces
- [ ] Identify root cause
- [ ] Plan remediation

## Sign-Off

| Checkpoint | Time | Status | Signed By |
|------------|------|--------|-----------|
| Pre-cutover complete | | ⬜ Pass ⬜ Fail | |
| Data migration complete | | ⬜ Pass ⬜ Fail | |
| DNS cutover complete | | ⬜ Pass ⬜ Fail | |
| Smoke tests passed | | ⬜ Pass ⬜ Fail | |
| 2-hour stability | | ⬜ Pass ⬜ Fail | |
| Cutover successful | | ⬜ Pass ⬜ Fail | |

## Emergency Contacts

- **Incident Commander**: [Name] [Phone] [Slack]
- **Engineering Lead**: [Name] [Phone] [Slack]
- **DevOps**: [Name] [Phone] [Slack]
- **Database Admin**: [Name] [Phone] [Slack]
- **Product Owner**: [Name] [Phone] [Slack]

## Notes

[Add real-time notes during cutover]
