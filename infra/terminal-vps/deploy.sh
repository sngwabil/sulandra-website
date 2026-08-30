#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="$ROOT/infra/terminal-vps"
ENV_FILE="$INFRA/.env"
DOMAIN="${1:-${TERMINAL_EXECUTION_DOMAIN:-}}"
EMAIL="${2:-${ACME_EMAIL:-}}"
TAG="${TERMINAL_STACK_TAG:-2026-08-30-v2}"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0 <terminal-domain> <acme-email>" >&2
  exit 1
fi
if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: sudo $0 terminal-exec.example.com admin@example.com" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker Engine is required. Install Docker Engine + Compose v2, then rerun." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi
if [[ ! -S /var/run/docker.sock ]]; then
  echo "/var/run/docker.sock was not found." >&2
  exit 1
fi

install -d -o 10001 -g 10001 -m 0700 /srv/sulandra-terminal/workspaces /srv/sulandra-terminal/state
if ! docker network inspect sulandra-terminal-internal >/dev/null 2>&1; then
  docker network create --internal sulandra-terminal-internal >/dev/null
fi

TOKEN=""
if [[ -f "$ENV_FILE" ]]; then
  TOKEN="$(grep '^TERMINAL_EXECUTION_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
fi
if [[ -z "$TOKEN" || "$TOKEN" == replace-* ]]; then
  TOKEN="$(openssl rand -hex 32)"
fi
DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"

umask 077
cat > "$ENV_FILE" <<ENV
TERMINAL_EXECUTION_DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
TERMINAL_EXECUTION_TOKEN=$TOKEN
TERMINAL_STACK_TAG=$TAG
DOCKER_GID=$DOCKER_GID
ENV
chmod 0600 "$ENV_FILE"

cd "$ROOT"
docker build -f Dockerfile.terminal-session -t "sulandra-terminal-session:$TAG" .
docker compose --env-file "$ENV_FILE" -f infra/terminal-vps/docker-compose.yml build executor
docker compose --env-file "$ENV_FILE" -f infra/terminal-vps/docker-compose.yml up -d

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
fi

for attempt in {1..30}; do
  if curl -fsS --max-time 5 -H "Authorization: Bearer $TOKEN" "https://$DOMAIN/healthz" >/dev/null 2>&1; then
    echo "Terminal execution plane is healthy at https://$DOMAIN"
    echo "Set Railway TERMINAL_EXECUTION_BASE_URL=https://$DOMAIN"
    echo "Set Railway TERMINAL_EXECUTION_TOKEN to the value stored in $ENV_FILE"
    exit 0
  fi
  sleep 2
done

echo "Deployment started but health verification did not pass. Inspect:" >&2
echo "  docker compose --env-file $ENV_FILE -f $INFRA/docker-compose.yml logs --tail=200" >&2
exit 1
