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
CODE_SERVER_DATA="${HOME}/.local/share/code-server"
mkdir -p "${HOME}/.config/code-server" "${CODE_SERVER_DATA}/User"

# This embedded IDE belongs to Sulandra IT Solutions. Disable upstream VS Code
# AI/Copilot surfaces so SIA remains the only assistant presented to the user.
# Also skip the generic Welcome/agent onboarding page on startup.
cat > "${CODE_SERVER_DATA}/User/settings.json" <<'JSON'
{
  "chat.disableAIFeatures": true,
  "workbench.settings.applyToAllProfiles": [
    "chat.disableAIFeatures"
  ],
  "workbench.startupEditor": "none",
  "workbench.welcomePage.walkthroughs.openOnInstall": false
}
JSON

# The session agent owns PORT=9000. code-server also honors PORT, so scope its
# environment to the dedicated IDE port. Keep the IDE loopback-only; the
# authenticated session-agent bridge is the only network path into it.
PORT="${IDE_PORT}" code-server \
  --bind-addr "127.0.0.1:${IDE_PORT}" \
  --auth none \
  --disable-telemetry \
  --disable-update-check \
  --disable-getting-started-override \
  --user-data-dir "${CODE_SERVER_DATA}" \
  /workspace >/tmp/sulandra-code-server.log 2>&1 &

exec node /agent/server.mjs
