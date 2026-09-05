#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"
SOURCE_DATABASE_HOST_OVERRIDE="${SOURCE_DATABASE_HOST_OVERRIDE:-}"
SOURCE_DATABASE_USER_OVERRIDE="${SOURCE_DATABASE_USER_OVERRIDE:-}"

block() {
  echo "[database-cutover-launcher] BLOCKED: $*" >&2
  exit 2
}

if [[ -z "$SOURCE_DATABASE_URL" ]]; then
  block "SOURCE_DATABASE_URL is required"
fi

if [[ -z "$SOURCE_DATABASE_HOST_OVERRIDE" ]]; then
  export SOURCE_DATABASE_EFFECTIVE_URL="$SOURCE_DATABASE_URL"
  exec /cutover/scripts/database-provider-cutover.sh
fi

if [[ -z "$SOURCE_DATABASE_USER_OVERRIDE" ]]; then
  block "SOURCE_DATABASE_USER_OVERRIDE is required with a source host override"
fi

case "$SOURCE_DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) block "SOURCE_DATABASE_URL must be a PostgreSQL URL" ;;
esac

scheme="${SOURCE_DATABASE_URL%%://*}"
rest="${SOURCE_DATABASE_URL#*://}"
if [[ "$rest" != *@* ]]; then
  block "SOURCE_DATABASE_URL must include credentials"
fi

userinfo="${rest%%@*}"
host_and_path="${rest#*@}"
if [[ "$userinfo" != *:* ]]; then
  block "SOURCE_DATABASE_URL must include a password"
fi
if [[ "$host_and_path" != */* ]]; then
  block "SOURCE_DATABASE_URL must include a database path"
fi

password="${userinfo#*:}"
path_and_query="/${host_and_path#*/}"
if [[ -z "$password" ]]; then
  block "SOURCE_DATABASE_URL password must not be empty"
fi

# Keep the original SOURCE_DATABASE_URL untouched so the guarded script can
# validate the exact approved Supabase project. Only the actual libpq
# connection URL is rewritten to the IPv4-capable Supabase session pooler.
export SOURCE_DATABASE_EFFECTIVE_URL="${scheme}://${SOURCE_DATABASE_USER_OVERRIDE}:${password}@${SOURCE_DATABASE_HOST_OVERRIDE}:5432${path_and_query}"

exec /cutover/scripts/database-provider-cutover.sh
