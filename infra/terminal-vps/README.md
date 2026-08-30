# Sulandra Terminal Execution Plane (Ubuntu VPS)

This directory deploys the Docker-capable execution plane used by the Railway terminal gateway.

## Traffic flow

Browser xterm -> `wss://sulandra-coding-terminal-worker-production.up.railway.app` (Railway gateway, JWT/Firebase verification and rate limiting) -> `wss://TERMINAL_EXECUTION_DOMAIN/v1/ws/...` (Caddy TLS) -> executor -> one Docker container per terminal session -> node-pty -> tmux -> bash.

The browser never receives `TERMINAL_EXECUTION_TOKEN`. The executor is not published directly; only Caddy exposes ports 80/443. Every REST/WSS request from the Railway gateway must carry the 256-bit execution token and the authenticated terminal-owner key.

## DNS and VPS prerequisites

Use a dedicated Ubuntu 22.04/24.04 VPS. Point an A/AAAA record such as `terminal-exec.sulandrahealth.com` to the VPS before starting Caddy. Only SSH plus ports 80 and 443 should be internet-accessible. Do not publish Docker's TCP API or the executor/session-agent ports.

Recommended minimum host: 2 vCPU / 4 GB RAM. Each terminal session is hard-limited to 512 MiB RAM, 0.5 CPU and 256 PIDs. The session Docker network is `--internal`, so session containers have no direct internet route by default.

## Install Docker Engine on Ubuntu

Use Docker's official apt repository rather than the convenience script:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git jq openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Docker-published ports are handled by Docker's firewall rules, so do not assume UFW alone can hide an accidentally published executor port. This stack deliberately publishes only Caddy's 80/443 ports; executor port 8081 and session-agent port 9000 stay on Docker networks only.

## Clone and deploy

```bash
sudo mkdir -p /opt/sulandra
sudo chown "$USER":"$USER" /opt/sulandra
cd /opt/sulandra
git clone https://github.com/sngwabil/sulandra-website.git
cd sulandra-website
git checkout feat/terminal-production-stack-v2
sudo ./infra/terminal-vps/deploy.sh terminal-exec.sulandrahealth.com admin@sulandrahealth.com
```

The deployment script creates `/srv/sulandra-terminal/workspaces`, `/srv/sulandra-terminal/state`, an internal Docker network, a 256-bit execution token, the hardened session image, the executor image and Caddy. It also creates a sanitized read-only source seed and excludes `.env` files, private keys, package-registry credentials, service-account material, Git metadata and dependency/build directories. Its `.env` file is mode 0600 and must never be committed.

Caddy obtains and renews the public TLS certificate automatically once the domain resolves to the VPS and ports 80/443 are reachable. WebSocket Upgrade traffic is handled by Caddy's reverse proxy; no separate insecure WebSocket listener is exposed.

## Railway cutover

After the VPS health check succeeds, copy the execution token from `infra/terminal-vps/.env` into the Railway terminal worker and set:

```text
TERMINAL_EXECUTION_BASE_URL=https://terminal-exec.sulandrahealth.com
TERMINAL_EXECUTION_TOKEN=<same 256-bit value from the VPS .env>
TERMINAL_WS_AUTH_PROVIDER=sulandra
TERMINAL_IDLE_MINUTES=15
```

`JWT_SECRET` and `FIREBASE_PROJECT_ID` may both be present. Keep `TERMINAL_WS_AUTH_PROVIDER=sulandra` while the current browser is using Sulandra access tokens. Set it to `firebase` only when the browser is actually supplying Firebase ID tokens with the required `organizationId`/`orgId` and `role` custom claims.

Then deploy the Railway worker from the release branch containing this stack. The gateway health endpoint returns 503 until the VPS execution plane is reachable and authenticated; this prevents a false-ready deployment.

## Verification

On the VPS:

```bash
cd /opt/sulandra/sulandra-website
TOKEN="$(grep '^TERMINAL_EXECUTION_TOKEN=' infra/terminal-vps/.env | cut -d= -f2-)"
curl -fsS -H "Authorization: Bearer $TOKEN" https://terminal-exec.sulandrahealth.com/healthz | jq .
docker network inspect sulandra-terminal-internal | jq '.[0].Internal'
docker compose --env-file infra/terminal-vps/.env -f infra/terminal-vps/docker-compose.yml ps
sudo ss -lntp | grep -E ':(22|80|443)\\b'
```

After opening one terminal session, verify its hard limits:

```bash
docker ps --filter label=com.sulandra.terminal=true
CID="$(docker ps -q --filter label=com.sulandra.terminal=true | head -n1)"
docker inspect "$CID" | jq '.[0].HostConfig | {Memory,MemorySwap,NanoCpus,PidsLimit,ReadonlyRootfs,CapDrop,SecurityOpt,NetworkMode}'
```

Expected values include `Memory=536870912`, `MemorySwap=536870912`, `NanoCpus=500000000`, `PidsLimit=256`, `ReadonlyRootfs=true`, `CapDrop=["ALL"]`, `no-new-privileges:true`, and `NetworkMode="sulandra-terminal-internal"`.

## Updating

```bash
cd /opt/sulandra/sulandra-website
git fetch origin
git checkout release/sulandra-1.0
git pull --ff-only
sudo ./infra/terminal-vps/deploy.sh terminal-exec.sulandrahealth.com admin@sulandrahealth.com
```

The existing execution token is preserved across updates. Do not delete `.env` unless intentionally rotating the Railway-to-VPS trust secret.

## Rollback

The VPS stack is independent from the Sulandra API and static website. To stop new terminal execution without affecting the rest of Sulandra:

```bash
cd /opt/sulandra/sulandra-website
docker compose --env-file infra/terminal-vps/.env -f infra/terminal-vps/docker-compose.yml down
```

Existing per-session containers can be removed with:

```bash
docker ps -aq --filter label=com.sulandra.terminal=true | xargs -r docker rm -f
```

Do not expose Docker TCP (`2375`/`2376`) publicly. The executor must use the local Unix socket only. The VPS should be dedicated to the terminal execution plane; do not co-locate unrelated workloads that would inherit risk from the trusted Docker-socket controller.
