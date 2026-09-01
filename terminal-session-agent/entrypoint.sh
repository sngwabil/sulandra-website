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

IDE_PORT="${SULANDRA_IDE_PORT:-13337}"
mkdir -p "${HOME}/.config/code-server" "${HOME}/.local/share/code-server"
# The session agent owns PORT=9000. code-server also honors PORT, so scope its
# environment to the dedicated IDE port instead of letting it collide with the agent.
PORT="${IDE_PORT}" code-server \
  --bind-addr "0.0.0.0:${IDE_PORT}" \
  --auth none \
  --disable-telemetry \
  --disable-update-check \
  --disable-getting-started-override \
  /workspace >/tmp/sulandra-code-server.log 2>&1 &

exec node /agent/server.mjs