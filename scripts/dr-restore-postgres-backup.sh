#!/usr/bin/env bash
set -euo pipefail

TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"
BACKUP_FILE="${BACKUP_FILE:-}"

if [[ -z "$TARGET_DATABASE_URL" ]]; then
  echo "TARGET_DATABASE_URL is required" >&2
  exit 2
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "BACKUP_FILE must point to an existing PostgreSQL custom-format backup" >&2
  exit 2
fi

if [[ "${DR_ALLOW_RESTORE:-false}" != "true" ]]; then
  echo "Restore blocked. Set DR_ALLOW_RESTORE=true only for an authorized restore drill or incident." >&2
  exit 4
fi

case "$TARGET_DATABASE_URL" in
  *production*|*prod*|*railway.app*)
    if [[ "${DR_ALLOW_PRODUCTION_RESTORE:-false}" != "true" ]]; then
      echo "Production-like restore target blocked. Set DR_ALLOW_PRODUCTION_RESTORE=true only under the DR incident runbook." >&2
      exit 5
    fi
    ;;
esac

command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required" >&2; exit 3; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 3; }

if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  sha256sum --check "${BACKUP_FILE}.sha256"
fi

pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  --dbname="$TARGET_DATABASE_URL" \
  "$BACKUP_FILE"

echo "PostgreSQL restore completed successfully into the authorized target database."
