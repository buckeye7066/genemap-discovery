#!/usr/bin/env bash

# GeneMap Discovery - manual backup snapshot
# Database-bearing archives are fail-closed and encrypted before they leave
# the temporary workspace. Set BACKUP_CODE_ONLY=true to explicitly create a
# source-only ZIP when no database URL is available.

set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
BACKUP_DIR="${REPO_ROOT}/backups"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP_NAME="genemap-backup-${TIMESTAMP}"
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/genemap-backup.XXXXXX")
STAGING_DIR="${TEMP_ROOT}/${BACKUP_NAME}"
PLAIN_ARCHIVE="${TEMP_ROOT}/${BACKUP_NAME}.zip"
DATABASE_INCLUDED=false
FINAL_EXTENSION="zip"

cleanup() {
  rm -rf -- "${TEMP_ROOT}"
}
trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' is not installed." >&2
    exit 1
  fi
}

echo "=== GeneMap Discovery Backup Script ==="
echo "Timestamp (UTC): ${TIMESTAMP}"

require_command rsync
require_command zip
require_command sha256sum
mkdir -p "${BACKUP_DIR}" "${STAGING_DIR}"

echo "[1/6] Copying repository files..."
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
  "${REPO_ROOT}/" "${STAGING_DIR}/"

echo "[2/6] Creating database dump..."
if [[ -n "${DATABASE_URL:-}" ]]; then
  require_command pg_dump
  require_command openssl

  if [[ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
    echo "Error: BACKUP_ENCRYPTION_PASSPHRASE is required when DATABASE_URL is set." >&2
    exit 1
  fi

  if ! pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file="${STAGING_DIR}/database.dump" \
    "${DATABASE_URL}"; then
    rm -f -- "${STAGING_DIR}/database.dump"
    echo "Error: pg_dump failed; no backup archive was created." >&2
    exit 1
  fi

  if [[ ! -s "${STAGING_DIR}/database.dump" ]]; then
    echo "Error: pg_dump produced an empty file; no backup archive was created." >&2
    exit 1
  fi

  DATABASE_INCLUDED=true
  FINAL_EXTENSION="zip.enc"
elif [[ "${BACKUP_CODE_ONLY:-false}" == "true" ]]; then
  echo "  DATABASE_URL is absent; creating the explicitly requested code-only snapshot."
else
  echo "Error: DATABASE_URL is not set." >&2
  echo "Set it for a complete encrypted backup, or set BACKUP_CODE_ONLY=true explicitly." >&2
  exit 1
fi

echo "[3/6] Creating backup metadata..."
cat > "${STAGING_DIR}/backup-info.txt" <<EOF
GeneMap Discovery Backup
========================
Date (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
Git Branch: $(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || echo "N/A")
Git Commit: $(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || echo "N/A")
Database Included: ${DATABASE_INCLUDED}
Database Archive Encrypted: ${DATABASE_INCLUDED}
Backup Type: Manual Snapshot
EOF

echo "[4/6] Creating archive..."
(
  cd "${TEMP_ROOT}"
  zip -rq "${PLAIN_ARCHIVE}" "${BACKUP_NAME}"
)

FINAL_PATH="${BACKUP_DIR}/${BACKUP_NAME}.${FINAL_EXTENSION}"
if [[ "${DATABASE_INCLUDED}" == "true" ]]; then
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -in "${PLAIN_ARCHIVE}" \
    -out "${FINAL_PATH}" \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  rm -f -- "${PLAIN_ARCHIVE}"
else
  mv "${PLAIN_ARCHIVE}" "${FINAL_PATH}"
fi

echo "[5/6] Writing integrity checksum..."
(
  cd "${BACKUP_DIR}"
  sha256sum "$(basename "${FINAL_PATH}")" > "$(basename "${FINAL_PATH}").sha256"
)

REMOTE_COPIED=false
if [[ -n "${DRIVE_DIR:-}" ]]; then
  if [[ "${DRIVE_DIR}" != /* || "${DRIVE_DIR}" == "/" || ! -d "${DRIVE_DIR}" || ! -w "${DRIVE_DIR}" ]]; then
    echo "Error: DRIVE_DIR must be an existing writable absolute directory other than '/'." >&2
    exit 1
  fi

  echo "[6/6] Copying encrypted archive and checksum to configured storage..."
  cp -- "${FINAL_PATH}" "${FINAL_PATH}.sha256" "${DRIVE_DIR}/"
  REMOTE_COPIED=true
else
  echo "[6/6] Remote copy not requested."
fi

BACKUP_SIZE=$(du -h "${FINAL_PATH}" | cut -f1)
echo "Backup complete: ${FINAL_PATH} (${BACKUP_SIZE})"
echo "  Database included: ${DATABASE_INCLUDED}"
echo "  Database-bearing archive encrypted: ${DATABASE_INCLUDED}"
echo "  Remote copy completed: ${REMOTE_COPIED}"
echo "Verify with: (cd '${BACKUP_DIR}' && sha256sum -c '$(basename "${FINAL_PATH}").sha256')"
