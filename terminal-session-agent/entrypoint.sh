#!/usr/bin/env bash
set -euo pipefail

cd /workspace
if [[ ! -d .git ]]; then
  git init -b workbench >/dev/null 2>&1 || git init >/dev/null 2>&1
  git config user.name "Sulandra Terminal"
  git config user.email "terminal@sulandra.local"
  git add -A
  git commit -m "Isolated terminal workspace baseline" --no-gpg-sign >/dev/null 2>&1 || true
fi

exec node /agent/server.mjs
