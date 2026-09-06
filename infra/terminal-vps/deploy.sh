#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="$ROOT/infra/terminal-vps"
ENV_FILE="$INFRA/.env"
COMPOSE_FILE="$INFRA/docker-compose.yml"
DOMAIN="${1:-${TERMINAL_EXECUTION_DOMAIN:-}}"
EMAIL="${2:-${ACME_EMAIL:-}}"
TAG="${TERMINAL_STACK_TAG:-2026-08-31-industry-v1}"
SEED_ROOT="/srv/sulandra-terminal/seed"
SEED_NEXT="/srv/sulandra-terminal/seed.next"
GEN_ID="$(date -u +%Y%m%d%H%M%S)-$(printf '%s' "$TAG" | sha256sum | cut -c1-8)"
GEN_A="sulandra-terminal-executor-gen-${GEN_ID}-a"
GEN_B="sulandra-terminal-executor-gen-${GEN_ID}-b"
GC_SCRIPT="/srv/sulandra-terminal/gc-executor-generations.sh"
GC_LOG="/srv/sulandra-terminal/gc-executor-generations.log"

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

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_egress_proxy() {
  local container_id status
  for attempt in {1..60}; do
    container_id="$(compose ps -q egress-proxy 2>/dev/null || true)"
    if [[ -n "$container_id" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      [[ "$status" == healthy ]] && return 0
    fi
    sleep 1
  done
  echo "Terminal egress proxy did not become healthy." >&2
  compose logs --tail=150 egress-proxy >&2 || true
  return 1
}

verify_developer_environment() {
  docker run --rm \
    --network sulandra-terminal-internal \
    -e HOME=/tmp/sulandra-smoke-home \
    -e SULANDRA_TERMINAL_CWD=/projects \
    -e TERMINAL_EGRESS_PROXY_URL=http://egress-proxy:3128 \
    -e HTTP_PROXY=http://egress-proxy:3128 \
    -e HTTPS_PROXY=http://egress-proxy:3128 \
    -e http_proxy=http://egress-proxy:3128 \
    -e https_proxy=http://egress-proxy:3128 \
    -e NODE_USE_ENV_PROXY=1 \
    --entrypoint bash \
    "sulandra-terminal-session:$TAG" \
    -lc 'source /usr/local/bin/sulandra-codebase-setup; cd /projects; sulandra-codebase-doctor --deployment'
}

wait_controller() {
  local name="$1"
  for attempt in {1..60}; do
    if docker exec "$name" node -e '
      const token = process.env.TERMINAL_EXECUTION_TOKEN;
      fetch("http://127.0.0.1:8081/healthz", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1000) })
        .then(async r => { if (!r.ok) throw new Error(String(r.status)); const j = await r.json(); if (!j.ok) throw new Error("not healthy"); })
        .then(() => process.exit(0)).catch(() => process.exit(1));
    ' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Executor generation $name did not become healthy." >&2
  docker logs --tail=150 "$name" >&2 || true
  return 1
}

caddy_admin_ready() {
  compose ps --status running --services 2>/dev/null | grep -qx 'caddy' || return 1
  compose exec -T caddy wget -qO- http://127.0.0.1:2019/config/ >/dev/null 2>&1
}

verify_codebase_sessions() (
  set -euo pipefail
  local owner="codebase:deploy-smoke:${GEN_ID}"
  local workspace_id=""
  local session_id=""

  cleanup() {
    if [[ -n "$session_id" ]]; then
      curl -fsS --max-time 10 -X DELETE \
        -H "Authorization: Bearer $TOKEN" \
        -H "x-sulandra-terminal-owner: $owner" \
        "https://$DOMAIN/v1/sessions/$session_id" >/dev/null 2>&1 || true
    fi
    if [[ -n "$workspace_id" ]]; then
      curl -fsS --max-time 10 -X DELETE \
        -H "Authorization: Bearer $TOKEN" \
        -H "x-sulandra-terminal-owner: $owner" \
        "https://$DOMAIN/v1/workspaces/$workspace_id" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT

  local workspace_json
  workspace_json="$(curl -fsS --connect-timeout 5 --max-time 20 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    -H 'Content-Type: application/json' \
    --data '{}' \
    "https://$DOMAIN/v1/workspaces")"
  workspace_id="$(sed -n 's/.*"workspaceId":"\([^"]*\)".*/\1/p' <<<"$workspace_json")"
  if [[ -z "$workspace_id" ]]; then
    echo "Codebase production smoke did not receive a workspaceId." >&2
    exit 1
  fi

  for attempt in 1 2 3; do
    local session_json output_json input_json marker ready
    session_json="$(curl -fsS --connect-timeout 5 --max-time 60 -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "x-sulandra-terminal-owner: $owner" \
      -H 'Content-Type: application/json' \
      --data '{"cols":120,"rows":32}' \
      "https://$DOMAIN/v1/workspaces/$workspace_id/sessions")"
    session_id="$(sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' <<<"$session_json")"
    if [[ -z "$session_id" ]]; then
      echo "Codebase production smoke attempt $attempt did not receive a sessionId." >&2
      exit 1
    fi

    output_json="$(curl -fsS --connect-timeout 5 --max-time 15 \
      -H "Authorization: Bearer $TOKEN" \
      -H "x-sulandra-terminal-owner: $owner" \
      "https://$DOMAIN/v1/sessions/$session_id/output?cursor=0")"
    grep -Fq '"alive":true' <<<"$output_json"

    marker="CODEBASE_DEPLOY_SMOKE_${attempt}_${GEN_ID}"
    input_json="{\"data\":\"printf '${marker}'\\r\"}"
    curl -fsS --connect-timeout 5 --max-time 15 -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "x-sulandra-terminal-owner: $owner" \
      -H 'Content-Type: application/json' \
      --data "$input_json" \
      "https://$DOMAIN/v1/sessions/$session_id/input" >/dev/null

    ready=false
    for poll in {1..20}; do
      output_json="$(curl -fsS --connect-timeout 5 --max-time 15 \
        -H "Authorization: Bearer $TOKEN" \
        -H "x-sulandra-terminal-owner: $owner" \
        "https://$DOMAIN/v1/sessions/$session_id/output?cursor=0")"
      if grep -Fq "$marker" <<<"$output_json"; then
        ready=true
        break
      fi
      sleep 0.5
    done
    if [[ "$ready" != true ]]; then
      echo "Codebase production smoke attempt $attempt did not accept PTY input." >&2
      exit 1
    fi

    curl -fsS --max-time 10 -X DELETE \
      -H "Authorization: Bearer $TOKEN" \
      -H "x-sulandra-terminal-owner: $owner" \
      "https://$DOMAIN/v1/sessions/$session_id" >/dev/null
    session_id=""
    echo "Codebase real-session smoke attempt $attempt passed."
  done

  curl -fsS --max-time 10 -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    "https://$DOMAIN/v1/workspaces/$workspace_id" >/dev/null
  workspace_id=""
  trap - EXIT
  echo "Three real Codebase terminal sessions provisioned, accepted PTY input, and cleaned up successfully."
)

verify_codebase_project_removal_recovery() (
  set -euo pipefail
  local owner="codebase:project-removal-smoke:${GEN_ID}"
  local workspace_id=""
  local session_id=""
  local fresh_session_id=""
  local project="terminal-removal-smoke"

  cleanup() {
    local id
    for id in "$session_id" "$fresh_session_id"; do
      if [[ -n "$id" ]]; then
        curl -fsS --max-time 10 -X DELETE \
          -H "Authorization: Bearer $TOKEN" \
          -H "x-sulandra-terminal-owner: $owner" \
          "https://$DOMAIN/v1/sessions/$id" >/dev/null 2>&1 || true
      fi
    done
    if [[ -n "$workspace_id" ]]; then
      curl -fsS --max-time 10 -X DELETE \
        -H "Authorization: Bearer $TOKEN" \
        -H "x-sulandra-terminal-owner: $owner" \
        "https://$DOMAIN/v1/workspaces/$workspace_id" >/dev/null 2>&1 || true
    fi
  }
  wait_for_marker() {
    local id="$1"
    local marker="$2"
    local output_json=""
    for poll in {1..24}; do
      output_json="$(curl -fsS --connect-timeout 5 --max-time 15 \
        -H "Authorization: Bearer $TOKEN" \
        -H "x-sulandra-terminal-owner: $owner" \
        "https://$DOMAIN/v1/sessions/$id/output?cursor=0")"
      if grep -Fq "$marker" <<<"$output_json"; then
        return 0
      fi
      sleep 0.5
    done
    echo "Codebase project-removal smoke did not observe $marker." >&2
    return 1
  }
  trap cleanup EXIT

  local workspace_json project_json removal_json session_json input_json marker
  workspace_json="$(curl -fsS --connect-timeout 5 --max-time 20 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    -H 'Content-Type: application/json' \
    --data '{}' \
    "https://$DOMAIN/v1/workspaces")"
  workspace_id="$(sed -n 's/.*"workspaceId":"\([^"]*\)".*/\1/p' <<<"$workspace_json")"
  if [[ -z "$workspace_id" ]]; then
    echo "Codebase project-removal smoke did not receive a workspaceId." >&2
    exit 1
  fi

  session_json="$(curl -fsS --connect-timeout 5 --max-time 60 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    -H 'Content-Type: application/json' \
    --data '{"cols":120,"rows":32}' \
    "https://$DOMAIN/v1/workspaces/$workspace_id/sessions")"
  session_id="$(sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' <<<"$session_json")"
  if [[ -z "$session_id" ]]; then
    echo "Codebase project-removal smoke did not receive the initial sessionId." >&2
    exit 1
  fi

  project_json="$(curl -fsS --connect-timeout 5 --max-time 30 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    -H 'Content-Type: application/json' \
    --data "{\"name\":\"$project\",\"gitInit\":false}" \
    "https://$DOMAIN/v1/workspaces/$workspace_id/codebase/projects")"
  grep -Fq "\"path\":\"/projects/$project\"" <<<"$project_json"
  grep -Fq '"active":true' <<<"$project_json"

  marker="CODEBASE_PROJECT_BEFORE_REMOVE_${GEN_ID}"
  input_json="{\"data\":\"cd -- /projects/$project && printf '${marker}:%s\\\\n' \\\"\$PWD\\\"\\r\"}"
  curl -fsS --connect-timeout 5 --max-time 15 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    -H 'Content-Type: application/json' \
    --data "$input_json" \
    "https://$DOMAIN/v1/sessions/$session_id/input" >/dev/null
  wait_for_marker "$session_id" "$marker:/projects/$project"

  removal_json="$(curl -fsS --connect-timeout 5 --max-time 30 -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    "https://$DOMAIN/v1/workspaces/$workspace_id/codebase/projects/$project")"
  grep -Fq '"ok":true' <<<"$removal_json"
  grep -Fq '"activeProject":""' <<<"$removal_json"

  marker="CODEBASE_PROJECT_AFTER_REMOVE_${GEN_ID}"
  input_json="{\"data\":\"printf '${marker}:%s\\\\n' \\\"\$PWD\\\"\\r\"}"
  curl -fsS --connect-timeout 5 --max-time 15 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    -H 'Content-Type: application/json' \
    --data "$input_json" \
    "https://$DOMAIN/v1/sessions/$session_id/input" >/dev/null
  wait_for_marker "$session_id" "$marker:/projects"

  session_json="$(curl -fsS --connect-timeout 5 --max-time 60 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    -H 'Content-Type: application/json' \
    --data '{"cols":120,"rows":32}' \
    "https://$DOMAIN/v1/workspaces/$workspace_id/sessions")"
  fresh_session_id="$(sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' <<<"$session_json")"
  if [[ -z "$fresh_session_id" || "$fresh_session_id" == "$session_id" ]]; then
    echo "Codebase project-removal smoke did not create a fresh terminal session." >&2
    exit 1
  fi
  marker="CODEBASE_PROJECT_FRESH_AFTER_REMOVE_${GEN_ID}"
  input_json="{\"data\":\"printf '${marker}:%s\\\\n' \\\"\$PWD\\\"\\r\"}"
  curl -fsS --connect-timeout 5 --max-time 15 -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-sulandra-terminal-owner: $owner" \
    -H 'Content-Type: application/json' \
    --data "$input_json" \
    "https://$DOMAIN/v1/sessions/$fresh_session_id/input" >/dev/null
  wait_for_marker "$fresh_session_id" "$marker:/projects"

  cleanup
  session_id=""
  fresh_session_id=""
  workspace_id=""
  trap - EXIT
  echo "Codebase project-removal recovery smoke passed: live and fresh terminals stayed in /projects."
)

install -d -o 10001 -g 10001 -m 0700 /srv/sulandra-terminal/workspaces /srv/sulandra-terminal/state
rm -rf "$SEED_NEXT"
install -d -o root -g root -m 0755 "$SEED_NEXT"
tar -C "$ROOT" \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./api/node_modules' \
  --exclude='./dist-web' \
  --exclude='./coverage' \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./infra/terminal-vps/.env' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='*.p12' \
  --exclude='*.pfx' \
  --exclude='.npmrc' \
  --exclude='*service-account*.json' \
  --exclude='*firebase-admin*.json' \
  -cf - . | tar -C "$SEED_NEXT" -xf -
chmod -R go-w "$SEED_NEXT"
rm -rf "$SEED_ROOT"
mv "$SEED_NEXT" "$SEED_ROOT"

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
TERMINAL_GIT_REPOSITORY=${TERMINAL_GIT_REPOSITORY:-https://github.com/sngwabil/sulandra-website.git}
TERMINAL_GIT_BASE_BRANCH=${TERMINAL_GIT_BASE_BRANCH:-release/sulandra-1.0}
ENV
chmod 0600 "$ENV_FILE"

cd "$ROOT"
docker build -f Dockerfile.terminal-session -t "sulandra-terminal-session:$TAG" .
compose build executor-a executor-b egress-proxy

# Keep the egress service available, but do not touch the currently serving
# executor generation while the replacement pair is being prepared.
compose up -d --no-deps egress-proxy
wait_egress_proxy
verify_developer_environment

# Start a completely new controller generation beside the old one. Workspace
# session containers and persistent workspaces are shared, so either generation
# can attach to an existing terminal session without recreating the workspace.
compose run -d --no-deps --name "$GEN_A" executor-a >/dev/null
compose run -d --no-deps --name "$GEN_B" executor-b >/dev/null
docker update --restart unless-stopped "$GEN_A" "$GEN_B" >/dev/null
wait_controller "$GEN_A"
wait_controller "$GEN_B"

# Validate the exact config that will be promoted before touching live routing.
docker run --rm \
  -e ACME_EMAIL="$EMAIL" \
  -e TERMINAL_EXECUTION_DOMAIN="$DOMAIN" \
  -e TERMINAL_EXECUTION_TOKEN="$TOKEN" \
  -e TERMINAL_UPSTREAM_PRIMARY="$GEN_A" \
  -e TERMINAL_UPSTREAM_SECONDARY="$GEN_B" \
  -v "$INFRA/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10-alpine caddy validate --config /etc/caddy/Caddyfile

if caddy_admin_ready; then
  # Normal path after the one-time migration: Caddy performs a graceful
  # in-process reload. Existing WebSockets keep the old handler and upstream;
  # only new requests are sent to the freshly validated generation.
  compose exec -T \
    -e TERMINAL_UPSTREAM_PRIMARY="$GEN_A" \
    -e TERMINAL_UPSTREAM_SECONDARY="$GEN_B" \
    caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "Promoted executor generation $GEN_ID with graceful Caddy reload."
else
  # One-time bootstrap from the legacy `admin off` Caddy configuration. This
  # restart installs the private loopback admin API; subsequent deployments use
  # the zero-downtime reload path above.
  echo "Bootstrapping graceful Caddy reload support (one-time migration)."
  TERMINAL_UPSTREAM_PRIMARY="$GEN_A" \
  TERMINAL_UPSTREAM_SECONDARY="$GEN_B" \
    compose up -d --no-deps --force-recreate caddy
  sleep 2
  if ! caddy_admin_ready; then
    echo "Caddy private admin endpoint did not become ready after bootstrap." >&2
    exit 1
  fi
  # The legacy fixed-name controllers can only have live streams from the
  # pre-bootstrap Caddy process, which was just replaced. Remove them now so
  # they cannot receive future traffic accidentally.
  compose rm -sf executor-a executor-b >/dev/null 2>&1 || true
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
fi

for attempt in {1..45}; do
  if curl -fsS --max-time 5 -H "Authorization: Bearer $TOKEN" "https://$DOMAIN/healthz" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == 45 ]]; then
    echo "Promotion completed but public health verification did not pass." >&2
    exit 1
  fi
  sleep 2
done

# A green controller health endpoint is not enough: create real Codebase sessions
# through the promoted public execution edge and prove each PTY accepts input.
# Project removal must never be able to leave production with a nominally healthy
# gateway that cannot actually provision a new terminal.
verify_codebase_sessions
verify_codebase_project_removal_recovery

# Retire only executor generations that have no established client streams.
# After a graceful Caddy reload, old WebSockets continue through the old
# controller until they naturally close. A detached collector removes those
# controllers later, so deployments never wait on or terminate a user's IDE or
# terminal session.
cat > "$GC_SCRIPT" <<'GC'
#!/usr/bin/env bash
set -u
CURRENT_A="${1:-}"
CURRENT_B="${2:-}"
count_established_8081() {
  local name="$1"
  docker exec "$name" node -e '
    const fs = require("fs");
    let total = 0;
    for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
      let text = "";
      try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
      for (const line of text.trim().split(/\n/).slice(1)) {
        const cols = line.trim().split(/\s+/);
        if (!cols[1] || cols[3] !== "01") continue;
        const localPort = cols[1].split(":").pop();
        if (localPort === "1F91") total += 1;
      }
    }
    console.log(total);
  ' 2>/dev/null
}

for round in $(seq 1 2160); do
  pending=0
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    [[ "$name" == "$CURRENT_A" || "$name" == "$CURRENT_B" ]] && continue
    if ! docker inspect "$name" >/dev/null 2>&1; then
      continue
    fi
    if [[ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo false)" != true ]]; then
      docker rm -f "$name" >/dev/null 2>&1 || true
      continue
    fi
    connections="$(count_established_8081 "$name" || echo 1)"
    if [[ "$connections" =~ ^[0-9]+$ ]] && (( connections == 0 )); then
      echo "[$(date -u +%FT%TZ)] retiring drained executor $name"
      docker rm -f "$name" >/dev/null 2>&1 || true
    else
      pending=1
    fi
  done < <(docker ps -a --format '{{.Names}}' | grep '^sulandra-terminal-executor-gen-' || true)
  (( pending == 0 )) && exit 0
  sleep 10
done
exit 0
GC
chmod 0700 "$GC_SCRIPT"
nohup bash "$GC_SCRIPT" "$GEN_A" "$GEN_B" >> "$GC_LOG" 2>&1 </dev/null &

# Bound retained controller generations in the unlikely event a browser leaves
# an abandoned TCP stream around for days. This does not touch the current pair.
mapfile -t generations < <(docker ps -a --format '{{.Names}}' | grep '^sulandra-terminal-executor-gen-' | grep -v -F "$GEN_A" | grep -v -F "$GEN_B" || true)
if (( ${#generations[@]} > 12 )); then
  echo "Warning: ${#generations[@]} draining executor containers remain; inspect $GC_LOG." >&2
fi

echo "Terminal execution plane is healthy at https://$DOMAIN"
echo "Codebase real-session smoke: 3/3 passed"
echo "Codebase project-removal recovery smoke: passed"
echo "Zero-downtime executor generation: $GEN_ID"
echo "HA executors: $GEN_A + $GEN_B"
echo "Controlled egress: GitHub/npm/PyPI/crates.io/Railway verified through Squid"
echo "Git workspaces: ${TERMINAL_GIT_REPOSITORY:-https://github.com/sngwabil/sulandra-website.git} @ ${TERMINAL_GIT_BASE_BRANCH:-release/sulandra-1.0}"
echo "Set Railway TERMINAL_EXECUTION_BASE_URL=https://$DOMAIN"
echo "Set Railway TERMINAL_EXECUTION_TOKEN to the value stored in $ENV_FILE"
