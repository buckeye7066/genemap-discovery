# Backup and recovery

This guide describes the repository's manual snapshot scripts. It does not
claim that a hosting provider backup, schedule, retention policy, restore SLA,
or alert exists unless current operational evidence has been recorded outside
the repository.

## What the scripts do

`scripts/backup-snapshot.sh` and `scripts/backup-snapshot.ps1`:

1. export only files tracked at the current Git `HEAD`;
2. refuse to run if common credential-file names are tracked;
3. create a PostgreSQL custom-format dump when `DATABASE_URL` is present;
4. encrypt the database dump and the final database-bearing archive with
   authenticated [`age`](https://age-encryption.org/) encryption;
5. write a SHA-256 checksum next to the archive;
6. optionally copy only the final archive and checksum to a pre-existing
   absolute `DRIVE_DIR`.

Untracked files and uncommitted changes are intentionally excluded. A complete
snapshot is tied to the Git commit recorded in `backup-info.txt`.

The scripts fail without producing a final artifact when the database dump,
encryption, archive, or checksum step fails. If `DATABASE_URL` is absent, the
operator must explicitly set `BACKUP_CODE_ONLY=true`; otherwise the command
fails instead of silently calling a source-only snapshot a complete backup.

## Prerequisites

- `git`, `tar`, and a SHA-256 implementation (`sha256sum` on Bash)
- `pg_dump` at least as new as the PostgreSQL server
- `age`
- an age recipient whose private identity is stored outside the application,
  repository, CI logs, and backup destination
- a database connection string supplied through `DATABASE_URL`

The scripts pass the connection string to libpq through `PGDATABASE`, not as a
`pg_dump` command-line argument. Do not print either database or key material.

## Create a complete backup

Linux/macOS:

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_AGE_RECIPIENT='age1...'
./scripts/backup-snapshot.sh
```

PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://...'
$env:BACKUP_AGE_RECIPIENT = 'age1...'
.\scripts\backup-snapshot.ps1
```

The result is:

```text
backups/genemap-backup-YYYYMMDD-HHMMSS.tar.gz.age
backups/genemap-backup-YYYYMMDD-HHMMSS.tar.gz.age.sha256
```

The outer archive is encrypted. Its database dump is also encrypted as
`database.dump.age`, so extracting the outer archive never places a plaintext
database dump on disk.

To create an explicitly source-only archive:

```bash
BACKUP_CODE_ONLY=true ./scripts/backup-snapshot.sh
```

Source-only output ends in `.tar.gz` and must not be recorded as a database
backup or restore point.

## Remote copy

`DRIVE_DIR` is optional and must already be an absolute, writable directory
other than the filesystem root:

```bash
DRIVE_DIR=/mnt/approved-backup-target ./scripts/backup-snapshot.sh
```

Configuring a path does not establish vendor retention, immutability, regional
storage, deletion propagation, access logging, or a service-level agreement.
Those controls must be verified for the actual storage operator and recorded in
the processor register before production use.

## Verify an artifact

Run the checksum from the backup directory:

```bash
cd backups
sha256sum -c genemap-backup-YYYYMMDD-HHMMSS.tar.gz.age.sha256
```

A checksum proves transport integrity only. A backup is not accepted until a
restore drill succeeds in an isolated environment.

## Restore drill

Never test a restore against production. Keep the restored environment isolated
from application traffic and outbound processors.

```bash
# 1. Verify integrity.
sha256sum -c genemap-backup-YYYYMMDD-HHMMSS.tar.gz.age.sha256

# 2. Decrypt and extract the outer archive.
age --decrypt --identity /secure/path/backup-identity.txt \
  --output restore.tar.gz \
  genemap-backup-YYYYMMDD-HHMMSS.tar.gz.age
mkdir restore-work
tar -xzf restore.tar.gz -C restore-work

# 3. Decrypt the nested custom-format database dump.
age --decrypt --identity /secure/path/backup-identity.txt \
  --output database.dump \
  restore-work/genemap-backup-*/database.dump.age

# 4. Restore only into an empty, isolated test database.
pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname "$RESTORE_TEST_DATABASE_URL" database.dump
```

After validation, securely remove plaintext restore files and destroy the test
database. Do not expose the restored service until deletion requests and legal
holds have been reconciled against a deletion/tombstone ledger that is newer
than the backup.

The repository does not currently provide that external tombstone ledger.
Consequently, a restored production database must remain quarantined until an
operator performs and records that reconciliation; otherwise previously deleted
data could be resurrected.

## Restore acceptance record

For every drill, record evidence with at least:

- drill date and operator;
- source Git SHA and backup checksum;
- PostgreSQL server and `pg_dump` versions;
- start/end timestamps and measured RTO;
- backup age and measured RPO;
- schema migration state;
- expected and restored table counts;
- row-count or stronger integrity comparison for every table;
- deletion/tombstone reconciliation result;
- confirmation that outbound integrations remained disabled;
- plaintext cleanup and test-environment destruction time.

Do not reuse an old table count as proof. Schema changes require a new drill and
new evidence.

## Retention and deletion

The scripts do not delete local or remote backups automatically. Production
operation requires a separately approved, enforced policy covering:

- backup cadence and RPO/RTO targets;
- immutable retention period and automatic expiry;
- access review and alerting on failed or missing backups;
- age identity custody, recovery, rotation, and revocation;
- deletion-request handling for live data, restored data, and processor copies;
- cryptographic erasure when an expired backup cannot be selectively edited;
- a boundary-safe application and API artifact to restore alongside the data.

Until those controls and a current restore drill are evidenced, backup readiness
must be reported as incomplete.

## Key handling

- Store the age private identity in a dedicated secret or key-management system,
  separate from both the database and backup storage.
- Grant decrypt access only to named recovery operators and audit every use.
- Keep at least one tested recovery identity in a separately controlled location.
- Rotate recipients under an approved procedure; never delete the last usable
  identity before all retained archives have expired or been re-encrypted.
- Never commit identities, database URLs, `.npmrc`, `.env` files, private keys,
  service-account files, or plaintext dumps.

## Operational status

Repository code alone cannot verify hosting-provider backups, remote-storage
controls, schedules, alerts, key custody, or a completed restore. Production
launch evidence must identify the live services, exact settings, reviewer,
review date, and evidence location. Unsupported statements such as “daily
provider backups” or a fixed provider retention period must not be published.
