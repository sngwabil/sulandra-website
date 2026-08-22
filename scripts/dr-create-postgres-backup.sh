#!/usr/bin/env bash
set -euo pipefail

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-${DATABASE_URL:-}}"
BACKUP_FILE="${BACKUP_FILE:-}"

if [[ -z "$SOURCE_DATABASE_URL" ]]; then
  echo "SOURCE_DATABASE_URL (or DATABASE_URL) is required" >&2
  exit 2
fi

if [[ -z "$BACKUP_FILE" ]]; then
  echo "BACKUP_FILE is required" >&2
  exit 2
fi

command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required" >&2; exit 3; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required" >&2; exit 3; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 3; }

mkdir -p "$(dirname "$BACKUP_FILE")"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

pg_dump "$SOURCE_DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$BACKUP_FILE"

pg_restore --list "$BACKUP_FILE" > "${BACKUP_FILE}.manifest"
sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SIZE_BYTES="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"

cat > "${BACKUP_FILE}.metadata.json" <<JSON
{
  "format": "postgres-custom",
  "startedAt": "$STARTED_AT",
  "finishedAt": "$FINISHED_AT",
  "sizeBytes": $SIZE_BYTES,
  "integrity": "sha256"
}
JSON

echo "Created PostgreSQL backup: $BACKUP_FILE ($SIZE_BYTES bytes)"
