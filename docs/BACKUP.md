# Backup and Recovery Guide

## Backup Strategy

### Automated Backups

#### Railway PostgreSQL
- **Frequency**: Daily automatic backups by Railway
- **Retention**: 7 days (free tier) or 30 days (pro tier)
- **Location**: Railway infrastructure

#### Manual Backups

Run before any critical operation:

```bash
# Bash (Linux/Mac)
./scripts/backup-snapshot.sh

# PowerShell (Windows)
./scripts/backup-snapshot.ps1
```

### What Gets Backed Up

1. **Database Schema**: Full Prisma schema
2. **Database Data**: All tables via pg_dump
3. **Environment Config**: .env.example files (no secrets)
4. **Application Code**: Git repository state
5. **Configuration**: All config files

### Backup Locations

- **Local**: `./backups/` directory (gitignored)
- **Remote**: Optional cloud storage (S3, Google Drive, etc.)

## Backup Scripts

### Bash Script (Linux/Mac)

Located at: `scripts/backup-snapshot.sh`

Usage:
```bash
# Basic backup
./scripts/backup-snapshot.sh

# With remote storage
DRIVE_DIR="/mnt/cloud-storage" ./scripts/backup-snapshot.sh
```

### PowerShell Script (Windows)

Located at: `scripts/backup-snapshot.ps1`

Usage:
```powershell
# Basic backup
.\scripts\backup-snapshot.ps1

# With remote storage
$env:DRIVE_DIR="D:\CloudStorage"; .\scripts\backup-snapshot.ps1
```

## Manual Database Backup

### Using pg_dump (Railway)

```bash
# Get DATABASE_URL from Railway
railway variables

# Backup to file
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# Backup with compression
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d-%H%M%S).sql.gz
```

### Using Prisma Studio

```bash
# Open Prisma Studio
railway run pnpm db:studio

# Export data manually from UI
# (Limited to small datasets)
```

## Recovery Procedures

### Restore from Local Backup

1. **Locate Backup File**
```bash
ls -lht backups/
# Find the backup you need: genemap-backup-YYYYMMDD-HHMMSS.zip
```

2. **Extract Backup**
```bash
unzip backups/genemap-backup-20240128-120000.zip -d restore-temp/
cd restore-temp/
```

3. **Restore Database**
```bash
# Connect to Railway database
railway connect

# Restore SQL dump
psql $DATABASE_URL < database-dump.sql
```

4. **Verify Restoration**
```sql
-- Check record counts
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM subscriptions;
SELECT COUNT(*) FROM institutional_licenses;
```

### Restore from Railway Backup

1. **Access Railway Dashboard**
   - Navigate to your PostgreSQL service
   - Click "Backups" tab

2. **Select Backup**
   - Choose backup point to restore
   - Click "Restore"

3. **Verify Restoration**
```bash
railway run pnpm db:studio
# Check data in Prisma Studio
```

### Disaster Recovery (Full System)

If entire system needs restoration:

1. **Restore Infrastructure**
   - Recreate Railway project if needed
   - Recreate PostgreSQL database
   - Reconfigure environment variables

2. **Restore Database**
   ```bash
   # From backup file
   psql $NEW_DATABASE_URL < backup.sql
   ```

3. **Deploy Application**
   ```bash
   # Backend
   cd services/api
   railway up
   
   # Frontend
   cd apps/web
   vercel --prod
   ```

4. **Verify Services**
   ```bash
   # Health check
   curl https://api.yourdomain.com/health
   
   # Test authentication
   curl -X POST https://api.yourdomain.com/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass"}'
   ```

## Backup Testing

### Monthly Backup Test

Execute on first Monday of each month:

1. **Create Test Backup**
   ```bash
   ./scripts/backup-snapshot.sh
   ```

2. **Restore to Test Environment**
   ```bash
   # Create test database
   psql $TEST_DATABASE_URL < backup.sql
   ```

3. **Verify Data Integrity**
   ```bash
   # Run validation queries
   railway run node scripts/validate-backup.js
   ```

4. **Document Results**
   - Record test date
   - Note any issues
   - Update procedures if needed

## Backup Retention Policy

### Local Backups
- **Keep**: Last 7 daily backups
- **Keep**: Last 4 weekly backups
- **Keep**: Last 12 monthly backups
- **Delete**: Older than 1 year

### Railway Automatic Backups
- **Keep**: Railway default retention (7-30 days)
- **Manual snapshots**: Before major changes

### Cleanup Script

```bash
# Delete local backups older than 30 days
find backups/ -name "genemap-backup-*.zip" -mtime +30 -delete
```

## Data Export (For Migration)

### Export Users
```sql
COPY (
  SELECT id, email, role, created_at, updated_at
  FROM users
) TO '/tmp/users-export.csv' WITH CSV HEADER;
```

### Export Subscriptions
```sql
COPY (
  SELECT 
    s.id, s.user_id, s.stripe_customer_id, 
    s.stripe_subscription_id, s.status, s.plan_type,
    s.current_period_end, s.created_at, s.updated_at
  FROM subscriptions s
  WHERE s.status IN ('active', 'trialing')
) TO '/tmp/subscriptions-export.csv' WITH CSV HEADER;
```

### Export Institutional Licenses
```sql
COPY (
  SELECT 
    il.id, il.organization_name, il.contact_email,
    il.license_type, il.max_seats, il.assigned_seats,
    il.status, il.start_date, il.end_date, il.renewal_date,
    il.stripe_customer_id, il.stripe_subscription_id
  FROM institutional_licenses il
  WHERE il.status = 'active'
) TO '/tmp/licenses-export.csv' WITH CSV HEADER;
```

## Security Considerations

### What NOT to Backup
- ❌ `.env` files with secrets
- ❌ `node_modules/` directories
- ❌ Built assets (`dist/`, `.next/`)
- ❌ Temporary files
- ❌ Log files (unless needed for debugging)

### Backup Encryption

For sensitive backups:

```bash
# Encrypt backup
gpg --symmetric --cipher-algo AES256 backup.sql

# Decrypt backup
gpg --decrypt backup.sql.gpg > backup.sql
```

### Access Control

- Limit backup access to authorized personnel
- Use secure storage locations
- Encrypt backups containing sensitive data
- Audit backup access logs

## Recovery Time Objectives (RTO)

| Scenario | Target RTO | Target RPO |
|----------|------------|------------|
| Single table corruption | 30 minutes | 1 hour |
| Database corruption | 2 hours | 24 hours |
| Full system failure | 4 hours | 24 hours |
| Disaster recovery | 8 hours | 24 hours |

**RTO** = Recovery Time Objective (how long to restore)  
**RPO** = Recovery Point Objective (how much data loss acceptable)

## Monitoring Backup Health

### Daily Checks
- [ ] Railway automatic backup completed
- [ ] Local backup script ran successfully
- [ ] Backup file size reasonable (not 0 bytes)

### Weekly Checks
- [ ] Test restore from backup
- [ ] Verify data integrity
- [ ] Check storage space

### Monthly Checks
- [ ] Full backup restoration test
- [ ] Update backup procedures
- [ ] Review retention policy

## Emergency Contacts

- **Database Admin**: [Name] [Contact]
- **DevOps**: [Name] [Contact]
- **Backup Storage Provider**: [Support Contact]

## Backup Checklist

### Before Major Change
- [ ] Create manual backup
- [ ] Verify backup file created
- [ ] Test backup restoration
- [ ] Document backup location
- [ ] Notify team of backup completion

### After Major Change
- [ ] Verify system functioning
- [ ] Create post-change backup
- [ ] Document changes made
- [ ] Update backup procedures if needed
