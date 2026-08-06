#!/usr/bin/env bash

# GeneMap Discovery - manual backup snapshot
# Database-bearing snapshots fail closed and use authenticated age encryption.
# Set BACKUP_CODE_ONLY=true to explicitly create a tracked-source-only archive.

set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
BACKUP_DIR="${REPO_ROOT}/backups"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP_NAME="genemap-backup-${TIMESTAMP}"
TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/genemap-backup.XXXXXX")
STAGING_DIR="${TEMP_ROOT}/${BACKUP_NAME}"
DATABASE_INCLUDED=false
FINAL_EXTENSION="tar.gz"

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

assert_tracked_source_is_safe() {
  local unsafe_paths
  unsafe_paths=$(git -C "${REPO_ROOT}" ls-tree -r --name-only HEAD \
    | grep -E '(^|/)(\.env($|\.)|\.npmrc$|credentials\.json$|service-account[^/]*\.json$|[^/]+\.(pem|key)$)' \
    | grep -Ev '(^|/)\.env(\.[^/]*)?\.example$|^\.npmrc$' \
    || true)
  if [[ -n "${unsafe_paths}" ]]; then
    echo "Error: refusing to archive tracked credential-like files:" >&2
    printf '%s\n' "${unsafe_paths}" >&2
    exit 1
  fi

  if git -C "${REPO_ROOT}" ls-tree --name-only HEAD -- .npmrc | grep -qx '.npmrc'; then
    local unsupported_npmrc
    unsupported_npmrc=$(git -C "${REPO_ROOT}" show HEAD:.npmrc \
      | grep -Ev '^([[:space:]]*|#.*|node-linker=(hoisted|isolated|pnp)|strict-peer-dependencies=(true|false))$' \
      || true)
    if [[ -n "${unsupported_npmrc}" ]]; then
      echo "Error: refusing to archive .npmrc with non-allowlisted settings." >&2
      exit 1
    fi
  fi
}
echo "=== GeneMap Discovery Backup Script ==="
echo "Timestamp (UTC): ${TIMESTAMP}"

for command_name in git tar sha256sum; do
  require_command "${command_name}"
done
git -C "${REPO_ROOT}" rev-parse --verify HEAD >/dev/null
assert_tracked_source_is_safe
mkdir -p "${BACKUP_DIR}" "${STAGING_DIR}"

echo "[1/6] Exporting tracked repository files..."
git -C "${REPO_ROOT}" archive --format=tar HEAD \
  | tar -xf - -C "${STAGING_DIR}"

echo "[2/6] Creating database dump..."
if [[ -n "${DATABASE_URL:-}" ]]; then
  require_command pg_dump
  require_command age

  if [[ -z "${BACKUP_AGE_RECIPIENT:-}" ]]; then
    echo "Error: BACKUP_AGE_RECIPIENT is required when DATABASE_URL is set." >&2
    exit 1
  fi

  ENCRYPTED_DUMP="${STAGING_DIR}/database.dump.age"
  if ! PGDATABASE="${DATABASE_URL}" pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    | age --recipient "${BACKUP_AGE_RECIPIENT}" --output "${ENCRYPTED_DUMP}"; then
    rm -f -- "${ENCRYPTED_DUMP}"
    echo "Error: database dump or encryption failed; no backup archive was created." >&2
    exit 1
  fi

  if [[ ! -s "${ENCRYPTED_DUMP}" ]]; then
    echo "Error: the encrypted database dump is empty; no backup archive was created." >&2
    exit 1
  fi

  DATABASE_INCLUDED=true
  FINAL_EXTENSION="tar.gz.age"
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
Git Commit: $(git -C "${REPO_ROOT}" rev-parse HEAD)
Source Scope: tracked files at Git commit only
Database Included: ${DATABASE_INCLUDED}
Database Dump Encrypted: ${DATABASE_INCLUDED}
Outer Archive Encrypted: ${DATABASE_INCLUDED}
Backup Type: Manual Snapshot
EOF

echo "[4/6] Creating final archive..."
FINAL_PATH="${BACKUP_DIR}/${BACKUP_NAME}.${FINAL_EXTENSION}"
if [[ "${DATABASE_INCLUDED}" == "true" ]]; then
  if ! tar -C "${TEMP_ROOT}" -czf - "${BACKUP_NAME}" \
    | age --recipient "${BACKUP_AGE_RECIPIENT}" --output "${FINAL_PATH}"; then
    rm -f -- "${FINAL_PATH}"
    echo "Error: final archive encryption failed." >&2
    exit 1
  fi
else
  tar -C "${TEMP_ROOT}" -czf "${FINAL_PATH}" "${BACKUP_NAME}"
fi

if [[ ! -s "${FINAL_PATH}" ]]; then
  rm -f -- "${FINAL_PATH}"
  echo "Error: final archive is empty." >&2
  exit 1
fi
chmod 600 "${FINAL_PATH}"

echo "[5/6] Writing integrity checksum..."
(
  cd "${BACKUP_DIR}"
  sha256sum "$(basename "${FINAL_PATH}")" > "$(basename "${FINAL_PATH}").sha256"
)
chmod 600 "${FINAL_PATH}.sha256"

REMOTE_COPIED=false
if [[ -n "${DRIVE_DIR:-}" ]]; then
  if [[ "${DRIVE_DIR}" != /* || "${DRIVE_DIR}" == "/" || ! -d "${DRIVE_DIR}" || ! -w "${DRIVE_DIR}" ]]; then
    echo "Error: DRIVE_DIR must be an existing writable absolute directory other than '/'." >&2
    exit 1
  fi

  echo "[6/6] Copying archive and checksum to configured storage..."
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
