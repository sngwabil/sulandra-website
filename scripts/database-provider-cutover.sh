#!/usr/bin/env bash
set -Eeuo pipefail

IFS=$'\n\t'

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"
TARGET_DATABASE_URL="${TARGET_DATABASE_URL:-}"
SOURCE_DATABASE_HOST_OVERRIDE="${SOURCE_DATABASE_HOST_OVERRIDE:-}"
SOURCE_DATABASE_USER_OVERRIDE="${SOURCE_DATABASE_USER_OVERRIDE:-}"
SOURCE_SUPABASE_PROJECT_REF="${SOURCE_SUPABASE_PROJECT_REF:-}"
CUTOVER_CONFIRMATION="${CUTOVER_CONFIRMATION:-}"
CUTOVER_SOURCE_QUIESCED="${CUTOVER_SOURCE_QUIESCED:-false}"
CUTOVER_EXPECTED_SOURCE_PUBLIC_TABLES="${CUTOVER_EXPECTED_SOURCE_PUBLIC_TABLES:-}"
CUTOVER_TEST_MODE="${CUTOVER_TEST_MODE:-false}"
CUTOVER_EVIDENCE_DIR="${CUTOVER_EVIDENCE_DIR:-/tmp/sulandra-database-cutover}"

fail() {
  echo "[database-cutover] BLOCKED: $*" >&2
  exit 2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

extract_host() {
  local value="${1#*://}"
  value="${value##*@}"
  value="${value%%/*}"
  value="${value%%\?*}"
  value="${value%%:*}"
  printf '%s' "$value" | tr '[:upper:]' '[:lower:]'
}

is_loopback_host() {
  case "$1" in
    127.0.0.1|localhost) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ -z "$SOURCE_DATABASE_URL" ]]; then fail "SOURCE_DATABASE_URL is required"; fi
if [[ -z "$TARGET_DATABASE_URL" ]]; then fail "TARGET_DATABASE_URL is required"; fi
if [[ "$SOURCE_DATABASE_URL" == "$TARGET_DATABASE_URL" ]]; then fail "source and target database URLs must differ"; fi
if [[ "$CUTOVER_CONFIRMATION" != "MIGRATE_SUPABASE_TO_RAILWAY" ]]; then
  fail "CUTOVER_CONFIRMATION must equal MIGRATE_SUPABASE_TO_RAILWAY"
fi
if [[ "$CUTOVER_SOURCE_QUIESCED" != "true" ]]; then
  fail "the source must be quiesced before a final migration"
fi

require_command psql
require_command pg_dump
require_command pg_restore
require_command sha256sum
require_command diff
require_command sed
require_command sort

source_host="$(extract_host "$SOURCE_DATABASE_URL")"
target_host="$(extract_host "$TARGET_DATABASE_URL")"

if [[ "$CUTOVER_TEST_MODE" == "true" ]]; then
  if ! is_loopback_host "$source_host" || ! is_loopback_host "$target_host"; then
    fail "CUTOVER_TEST_MODE is restricted to loopback source and target hosts"
  fi
else
  if [[ -z "$SOURCE_SUPABASE_PROJECT_REF" || ! "$SOURCE_SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
    fail "SOURCE_SUPABASE_PROJECT_REF must be the 20-character source project reference"
  fi
  if [[ "$source_host" != "db.${SOURCE_SUPABASE_PROJECT_REF}.supabase.co" ]]; then
    fail "source host is not the explicitly approved Supabase project"
  fi
  if [[ "$target_host" != *.railway.internal ]]; then
    fail "target host must use Railway private networking (*.railway.internal)"
  fi
  if [[ -n "$SOURCE_DATABASE_HOST_OVERRIDE" && ! "$SOURCE_DATABASE_HOST_OVERRIDE" =~ ^[a-z0-9-]+\.pooler\.supabase\.com$ ]]; then
    fail "source host override must be a Supabase pooler hostname"
  fi
  if [[ -n "$SOURCE_DATABASE_HOST_OVERRIDE" && -z "$SOURCE_DATABASE_USER_OVERRIDE" ]]; then
    fail "SOURCE_DATABASE_USER_OVERRIDE is required with a source host override"
  fi
fi

SOURCE_PSQL_ARGS=(--no-psqlrc --set=ON_ERROR_STOP=1 "--dbname=$SOURCE_DATABASE_URL")
SOURCE_DUMP_ARGS=("--dbname=$SOURCE_DATABASE_URL")
if [[ -n "$SOURCE_DATABASE_HOST_OVERRIDE" ]]; then
  SOURCE_PSQL_ARGS+=("--host=$SOURCE_DATABASE_HOST_OVERRIDE" "--username=$SOURCE_DATABASE_USER_OVERRIDE" --port=5432)
  SOURCE_DUMP_ARGS+=("--host=$SOURCE_DATABASE_HOST_OVERRIDE" "--username=$SOURCE_DATABASE_USER_OVERRIDE" --port=5432)
fi
TARGET_PSQL_ARGS=(--no-psqlrc --set=ON_ERROR_STOP=1 "--dbname=$TARGET_DATABASE_URL")
TARGET_DUMP_ARGS=("--dbname=$TARGET_DATABASE_URL")

source_scalar() {
  psql "${SOURCE_PSQL_ARGS[@]}" --tuples-only --no-align --command "$1" | tr -d '[:space:]'
}

target_scalar() {
  psql "${TARGET_PSQL_ARGS[@]}" --tuples-only --no-align --command "$1" | tr -d '[:space:]'
}

managed_count() {
  local relation="$1"
  local count_sql="SELECT CASE WHEN to_regclass('$relation') IS NULL THEN 0 ELSE 1 END"
  if [[ "$(source_scalar "$count_sql")" == "0" ]]; then
    printf '0'
    return
  fi
  source_scalar "SELECT count(*)::bigint FROM $relation"
}

normalize_schema_dump() {
  sed -E \
    -e '/^-- Dumped from database version /d' \
    -e '/^-- Dumped by pg_dump version /d' \
    -e '/^\\restrict /d' \
    -e '/^\\unrestrict /d' \
    "$1" > "$2"
}

capture_inventory() {
  local side="$1"
  local output="$2"
  local -a args
  if [[ "$side" == "source" ]]; then args=("${SOURCE_PSQL_ARGS[@]}"); else args=("${TARGET_PSQL_ARGS[@]}"); fi

  psql "${args[@]}" --tuples-only --no-align --field-separator=$'\t' > "$output" <<'SQL'
SET TIME ZONE 'UTC';
SET extra_float_digits = 3;
SET bytea_output = 'hex';
SET DateStyle = 'ISO';
SET IntervalStyle = 'postgres';

SELECT format(
  $inventory$
  SELECT 'TABLE', %L, count(*)::bigint,
         COALESCE(
           md5(string_agg(md5(to_jsonb(row_value)::text), '' ORDER BY md5(to_jsonb(row_value)::text))),
           md5('')
         )
    FROM %I.%I AS row_value;
  $inventory$,
  table_schema || '.' || table_name,
  table_schema,
  table_name
)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec

SELECT format(
  $inventory$
  SELECT 'BYTEA', %L, %L,
         count(*) FILTER (WHERE %I IS NOT NULL)::bigint,
         COALESCE(sum(octet_length(%I)), 0)::bigint
    FROM %I.%I;
  $inventory$,
  table_schema || '.' || table_name,
  column_name,
  column_name,
  column_name,
  table_schema,
  table_name
)
FROM information_schema.columns
WHERE table_schema = 'public' AND data_type = 'bytea'
ORDER BY table_name, ordinal_position
\gexec

SELECT format(
  $inventory$
  SELECT 'SEQUENCE', %L, last_value::text, is_called::text
    FROM %I.%I;
  $inventory$,
  sequence_schema || '.' || sequence_name,
  sequence_schema,
  sequence_name
)
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name
\gexec
SQL

  LC_ALL=C sort -o "$output" "$output"
}

mkdir -p "$CUTOVER_EVIDENCE_DIR"
chmod 700 "$CUTOVER_EVIDENCE_DIR"

backup_file="$CUTOVER_EVIDENCE_DIR/sulandra-public.dump"
source_schema_raw="$CUTOVER_EVIDENCE_DIR/source-schema.raw.sql"
target_schema_raw="$CUTOVER_EVIDENCE_DIR/target-schema.raw.sql"
source_schema="$CUTOVER_EVIDENCE_DIR/source-schema.sql"
target_schema="$CUTOVER_EVIDENCE_DIR/target-schema.sql"
source_inventory="$CUTOVER_EVIDENCE_DIR/source-inventory.tsv"
target_inventory="$CUTOVER_EVIDENCE_DIR/target-inventory.tsv"

echo "[database-cutover] Running non-mutating source and target preflight checks."
source_public_tables="$(source_scalar "SELECT count(*)::bigint FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
target_public_tables="$(target_scalar "SELECT count(*)::bigint FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
source_auth_users="$(managed_count 'auth.users')"
source_auth_identities="$(managed_count 'auth.identities')"
source_auth_sessions="$(managed_count 'auth.sessions')"
source_auth_audit_entries="$(managed_count 'auth.audit_log_entries')"
source_storage_buckets="$(managed_count 'storage.buckets')"
source_storage_objects="$(managed_count 'storage.objects')"
source_vault_secrets="$(managed_count 'vault.secrets')"
source_realtime_messages="$(managed_count 'realtime.messages')"
source_large_objects="$(source_scalar "SELECT count(*)::bigint FROM pg_largeobject_metadata")"
source_unexpected_schemas="$(source_scalar "SELECT count(*)::bigint FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' AND nspname NOT IN ('public','auth','extensions','graphql','graphql_public','realtime','storage','vault')")"
source_nonportable_type_columns="$(source_scalar "SELECT count(*)::bigint FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped AND t.typnamespace NOT IN ('pg_catalog'::regnamespace,'public'::regnamespace)")"
source_major="$(source_scalar "SELECT current_setting('server_version_num')::integer / 10000")"
target_major="$(target_scalar "SELECT current_setting('server_version_num')::integer / 10000")"
target_public_relations="$(target_scalar "SELECT count(*)::bigint FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")"
target_public_functions="$(target_scalar "SELECT count(*)::bigint FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")"
target_public_types="$(target_scalar "SELECT count(*)::bigint FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'")"

if [[ -n "$CUTOVER_EXPECTED_SOURCE_PUBLIC_TABLES" && "$source_public_tables" != "$CUTOVER_EXPECTED_SOURCE_PUBLIC_TABLES" ]]; then
  fail "source public table count changed (expected $CUTOVER_EXPECTED_SOURCE_PUBLIC_TABLES, found $source_public_tables)"
fi
if [[ "$source_public_tables" == "0" ]]; then fail "source public schema is empty"; fi
if [[ "$target_public_relations" != "0" || "$target_public_functions" != "0" || "$target_public_types" != "0" ]]; then
  fail "target public schema is not empty (relations=$target_public_relations functions=$target_public_functions types=$target_public_types)"
fi
if [[ "$target_public_tables" != "0" ]]; then fail "target public schema is not empty ($target_public_tables tables found)"; fi
if [[ "$source_auth_users" != "0" || "$source_auth_identities" != "0" || "$source_auth_sessions" != "0" || "$source_auth_audit_entries" != "0" ]]; then
  fail "Supabase Auth contains data (users=$source_auth_users identities=$source_auth_identities sessions=$source_auth_sessions audit_entries=$source_auth_audit_entries) and requires a separate approved auth migration"
fi
if [[ "$source_storage_buckets" != "0" || "$source_storage_objects" != "0" ]]; then
  fail "Supabase Storage is not empty and requires a separate approved object migration"
fi
if [[ "$source_vault_secrets" != "0" ]]; then fail "Supabase Vault contains $source_vault_secrets secrets and requires a separate approved secret migration"; fi
if [[ "$source_realtime_messages" != "0" ]]; then fail "Supabase Realtime contains $source_realtime_messages retained messages and requires review"; fi
if [[ "$source_large_objects" != "0" ]]; then fail "source contains PostgreSQL large objects that are outside the approved public-schema path"; fi
if [[ "$source_unexpected_schemas" != "0" ]]; then fail "source contains an unexpected non-system schema and requires scope review"; fi
if [[ "$source_nonportable_type_columns" != "0" ]]; then fail "public tables contain $source_nonportable_type_columns columns backed by non-portable schema types"; fi
if (( target_major < source_major )); then fail "target PostgreSQL major version $target_major is older than source major version $source_major"; fi

for required_table in Organization User EmployeeApplication AuditEvent LegalEntity SpirePatient; do
  if [[ "$(source_scalar "SELECT to_regclass('public.\"$required_table\"') IS NOT NULL")" != "t" ]]; then
    fail "source is missing required table $required_table"
  fi
done

echo "[database-cutover] Source preflight passed: public tables=$source_public_tables; Auth data=0; Storage data=0; Vault secrets=0; Realtime retained messages=0; large objects=0; source PostgreSQL=$source_major; target PostgreSQL=$target_major."
echo "[database-cutover] Capturing source schema and exact content fingerprints."

pg_dump "${SOURCE_DUMP_ARGS[@]}" \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file="$source_schema_raw"
normalize_schema_dump "$source_schema_raw" "$source_schema"
capture_inventory source "$source_inventory"

pg_dump "${SOURCE_DUMP_ARGS[@]}" \
  --schema=public \
  --format=custom \
  --compress=gzip:9 \
  --no-owner \
  --no-privileges \
  --file="$backup_file"
pg_restore --list "$backup_file" > "$CUTOVER_EVIDENCE_DIR/restore.manifest"
sha256sum "$backup_file" > "$CUTOVER_EVIDENCE_DIR/sulandra-public.dump.sha256"

echo "[database-cutover] Restoring the immutable source snapshot into the empty Railway target."
pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  "--dbname=$TARGET_DATABASE_URL" \
  "$backup_file"

echo "[database-cutover] Capturing Railway target schema and exact content fingerprints."
pg_dump "${TARGET_DUMP_ARGS[@]}" \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file="$target_schema_raw"
normalize_schema_dump "$target_schema_raw" "$target_schema"
capture_inventory target "$target_inventory"

if ! diff -u "$source_schema" "$target_schema" > "$CUTOVER_EVIDENCE_DIR/schema.diff"; then
  fail "source and Railway schema dumps differ; traffic was not switched"
fi
if ! diff -u "$source_inventory" "$target_inventory" > "$CUTOVER_EVIDENCE_DIR/inventory.diff"; then
  fail "source and Railway row/content fingerprints differ; traffic was not switched"
fi

target_public_tables="$(target_scalar "SELECT count(*)::bigint FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
if [[ "$target_public_tables" != "$source_public_tables" ]]; then
  fail "target public table count does not match source"
fi

exact_rows="$(awk -F $'\t' '$1 == "TABLE" { total += $3 } END { print total + 0 }' "$source_inventory")"
embedded_file_rows="$(awk -F $'\t' '$1 == "BYTEA" { total += $4 } END { print total + 0 }' "$source_inventory")"
embedded_file_bytes="$(awk -F $'\t' '$1 == "BYTEA" { total += $5 } END { print total + 0 }' "$source_inventory")"
backup_bytes="$(wc -c < "$backup_file" | tr -d ' ')"
backup_sha256="$(cut -d ' ' -f 1 "$CUTOVER_EVIDENCE_DIR/sulandra-public.dump.sha256")"

psql "${TARGET_PSQL_ARGS[@]}" --command 'ANALYZE;' >/dev/null

cat > "$CUTOVER_EVIDENCE_DIR/result.json" <<JSON
{
  "status": "IMPORT_VERIFIED",
  "publicTables": $source_public_tables,
  "exactRows": $exact_rows,
  "embeddedFileValues": $embedded_file_rows,
  "embeddedFileBytes": $embedded_file_bytes,
  "backupBytes": $backup_bytes,
  "backupSha256": "$backup_sha256",
  "schemaParity": true,
  "contentParity": true,
  "sourceModified": false,
  "trafficSwitched": false
}
JSON

echo "[database-cutover] IMPORT_VERIFIED: tables=$source_public_tables exact_rows=$exact_rows embedded_file_values=$embedded_file_rows embedded_file_bytes=$embedded_file_bytes backup_bytes=$backup_bytes sha256=$backup_sha256"
echo "[database-cutover] Source was not modified and traffic was not switched. The verified Railway target is ready for the separate routing step."
