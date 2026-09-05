#!/usr/bin/env bash
set -Eeuo pipefail

script_path="${1:-}"
if [[ -z "$script_path" || ! -f "$script_path" ]]; then
  echo "prepare-database-provider-cutover: cutover script path is required" >&2
  exit 2
fi

tmp_path="${script_path}.prepared"

awk '
BEGIN {
  replacing = 0
  replaced = 0
}
$0 == "normalize_schema_dump() {" {
  print "normalize_schema_dump() {"
  print "  local input=\"$1\""
  print "  local output=\"$2\""
  print ""
  print "  if (( ${source_major:-0} < 18 && ${target_major:-0} >= 18 )); then"
  print "    # PostgreSQL 18 stores NOT NULL as pg_constraint rows and can emit"
  print "    # generated constraint names when re-dumping a pre-18 restore. The"
  print "    # names are metadata-only; canonicalize them so parity remains strict"
  print "    # for every schema property that existed on the PostgreSQL 17 source."
  print "    sed -E \\\""
  print "      -e '\''/^-- Dumped from database version /d'\'' \\\""
  print "      -e '\''/^-- Dumped by pg_dump version /d'\'' \\\""
  print "      -e '\''/^\\\\restrict /d'\'' \\\""
  print "      -e '\''/^\\\\unrestrict /d'\'' \\\""
  print "      -e '\''s/ CONSTRAINT \"[^\"]+\" NOT NULL/ NOT NULL/g'\'' \\\""
  print "      \"$input\" > \"$output\""
  print "    return"
  print "  fi"
  print ""
  print "  sed -E \\\""
  print "    -e '\''/^-- Dumped from database version /d'\'' \\\""
  print "    -e '\''/^-- Dumped by pg_dump version /d'\'' \\\""
  print "    -e '\''/^\\\\restrict /d'\'' \\\""
  print "    -e '\''/^\\\\unrestrict /d'\'' \\\""
  print "    \"$input\" > \"$output\""
  print "}"
  replacing = 1
  replaced = 1
  next
}
replacing {
  if ($0 == "}") replacing = 0
  next
}
{ print }
END {
  if (!replaced) exit 42
}
' "$script_path" > "$tmp_path" || {
  status=$?
  rm -f "$tmp_path"
  echo "prepare-database-provider-cutover: failed to replace schema normalizer (status=$status)" >&2
  exit "$status"
}

mv "$tmp_path" "$script_path"
chmod 0500 "$script_path"

grep -F 'source_major:-0' "$script_path" >/dev/null
grep -F 'CONSTRAINT "[^"]+" NOT NULL' "$script_path" >/dev/null

echo "prepare-database-provider-cutover: PostgreSQL 17 -> 18 schema canonicalizer installed"
