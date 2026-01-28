#!/bin/bash

# GeneMap Discovery - Backup Snapshot Script
# Creates a timestamped backup of the repository and database

set -e

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="genemap-backup-${TIMESTAMP}"
BACKUP_DIR="./backups"
TEMP_DIR="/tmp/${BACKUP_NAME}"

echo "=== GeneMap Discovery Backup Script ==="
echo "Timestamp: ${TIMESTAMP}"
echo ""

mkdir -p "${BACKUP_DIR}"
mkdir -p "${TEMP_DIR}"

cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)

echo "[1/5] Copying repository files..."
rsync -a \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.next' \
  --exclude 'build' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.production' \
  --exclude 'backups' \
  --exclude '.git' \
  --exclude '*.log' \
  "${REPO_ROOT}/" "${TEMP_DIR}/"

echo "[2/5] Backing up database (if DATABASE_URL is set)..."
if [ -n "$DATABASE_URL" ]; then
  echo "  Exporting database..."
  pg_dump "$DATABASE_URL" > "${TEMP_DIR}/database-dump.sql" 2>/dev/null || {
    echo "  Warning: Database backup failed. Continuing without DB dump."
    echo "  (This is normal if database is not accessible)"
  }
else
  echo "  DATABASE_URL not set, skipping database backup"
  echo "  (Database will be backed up by Railway automatically)"
fi

echo "[3/5] Creating backup metadata..."
cat > "${TEMP_DIR}/backup-info.txt" << EOF
GeneMap Discovery Backup
========================
Date: $(date)
Git Branch: $(git branch --show-current 2>/dev/null || echo "N/A")
Git Commit: $(git rev-parse HEAD 2>/dev/null || echo "N/A")
Backup Type: Manual Snapshot
EOF

echo "[4/5] Creating ZIP archive..."
cd /tmp
zip -r "${BACKUP_NAME}.zip" "${BACKUP_NAME}" > /dev/null
mv "${BACKUP_NAME}.zip" "${REPO_ROOT}/${BACKUP_DIR}/"

echo "[5/5] Cleaning up temporary files..."
rm -rf "${TEMP_DIR}"

BACKUP_PATH="${REPO_ROOT}/${BACKUP_DIR}/${BACKUP_NAME}.zip"
BACKUP_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)

echo ""
echo "✅ Backup complete!"
echo "   Location: ${BACKUP_PATH}"
echo "   Size: ${BACKUP_SIZE}"
echo ""

if [ -n "$DRIVE_DIR" ]; then
  echo "Copying to remote storage: ${DRIVE_DIR}"
  mkdir -p "${DRIVE_DIR}"
  cp "${BACKUP_PATH}" "${DRIVE_DIR}/"
  echo "✅ Remote copy complete!"
  echo ""
fi

echo "Backup summary:"
echo "  - Repository code: ✅"
echo "  - Configuration files: ✅"
echo "  - Database dump: $([ -f "${TEMP_DIR}/database-dump.sql" ] && echo "✅" || echo "⚠️  (skipped)")"
echo "  - Remote copy: $([ -n "$DRIVE_DIR" ] && echo "✅" || echo "⚠️  (not configured)")"
echo ""
echo "To restore this backup, see docs/BACKUP.md"
