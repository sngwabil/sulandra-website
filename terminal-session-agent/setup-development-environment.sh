#!/usr/bin/env bash
set -Eeuo pipefail

# Idempotent per-session bootstrap. /home/terminal is a persistent, private
# bind mount, so one-time GitHub and Railway logins survive session recreation.
# /projects is the durable project root. A selected project is only a requested
# terminal cwd; never recreate a deleted project merely because an older session
# still carries that path in SULANDRA_TERMINAL_CWD.
PROJECTS_DIR="/projects"
REQUESTED_TERMINAL_CWD="${SULANDRA_TERMINAL_CWD:-/projects}"
if [[ "${REQUESTED_TERMINAL_CWD}" != "/projects" && "${REQUESTED_TERMINAL_CWD}" != /projects/* ]]; then
  REQUESTED_TERMINAL_CWD="/projects"
fi
mkdir -p "${PROJECTS_DIR}"
if [[ ! -d "${REQUESTED_TERMINAL_CWD}" ]]; then
  REQUESTED_TERMINAL_CWD="/projects"
fi
export SULANDRA_TERMINAL_CWD="${REQUESTED_TERMINAL_CWD}"
# entrypoint.sh defines TERMINAL_CWD before sourcing this script. When this file
# is sourced there, update that shell variable too so a restarted container falls
# back to /projects instead of entering a restart loop on a removed project path.
if [[ -n "${TERMINAL_CWD+x}" ]]; then
  TERMINAL_CWD="${REQUESTED_TERMINAL_CWD}"
fi

PROXY_URL="${TERMINAL_EGRESS_PROXY_URL:-${HTTPS_PROXY:-${HTTP_PROXY:-http://egress-proxy:3128}}}"
GIT_NAME="${SULANDRA_GIT_USER_NAME:-Sulpitius Gwabil}"
GIT_EMAIL="${SULANDRA_GIT_USER_EMAIL:-Sulpitius.gwabil@gmail.com}"
GIT_CONFIG_DIR="${HOME}/.config/git"
GIT_IGNORE="${GIT_CONFIG_DIR}/ignore"
SULANDRA_CONFIG_DIR="${HOME}/.config/sulandra"

umask 077
mkdir -p \
  "${PROJECTS_DIR}" \
  "${GIT_CONFIG_DIR}" \
  "${HOME}/.config/pip" \
  "${HOME}/.cargo" \
  "${HOME}/.ssh/config.d" \
  "${SULANDRA_CONFIG_DIR}"

write_private() {
  local target="$1"
  local mode="$2"
  local temporary
  temporary="$(mktemp "$(dirname "${target}")/.sulandra.XXXXXX")"
  tee "${temporary}" >/dev/null
  chmod "${mode}" "${temporary}"
  mv -f "${temporary}" "${target}"
}

write_private "${SULANDRA_CONFIG_DIR}/proxy.env" 0600 <<EOF
export HTTP_PROXY='${PROXY_URL}'
export HTTPS_PROXY='${PROXY_URL}'
export http_proxy='${PROXY_URL}'
export https_proxy='${PROXY_URL}'
export NODE_USE_ENV_PROXY=1
export NO_PROXY='localhost,127.0.0.1,::1'
export no_proxy='localhost,127.0.0.1,::1'
EOF

write_private "${HOME}/.npmrc" 0600 <<EOF
proxy=${PROXY_URL}
https-proxy=${PROXY_URL}
strict-ssl=true
EOF

write_private "${HOME}/.config/pip/pip.conf" 0600 <<EOF
[global]
proxy = ${PROXY_URL}
timeout = 60
EOF

write_private "${HOME}/.cargo/config.toml" 0600 <<EOF
[http]
proxy = "${PROXY_URL}"
timeout = 600
check-revoke = true
EOF

write_private "${GIT_IGNORE}" 0600 <<'EOF'
# Never stage Codebase control-plane state from a project repository.
/workspace/
/workspace/**
.sulandra-projects/
.sulandra-home/
.sulandra-terminal-history/
EOF

git config --global user.name "${GIT_NAME}"
git config --global user.email "${GIT_EMAIL}"
git config --global init.defaultBranch main
git config --global fetch.prune true
git config --global push.autoSetupRemote true
git config --global core.excludesFile "${GIT_IGNORE}"
git config --global http.proxy "${PROXY_URL}"
git config --global credential.useHttpPath true
git config --global credential.https://github.com.helper '!gh auth git-credential'
git config --global --replace-all 'includeIf.gitdir:/workspace/.git/.path' /etc/gitconfig-sulandra-workspace

# HTTPS is the default, prompt-free Git transport after one `sulandra-github-login`.
# SSH remains available through Squid's CONNECT tunnel on github.com's port 443.
proxy_authority="${PROXY_URL#*://}"
proxy_authority="${proxy_authority%%/*}"
write_private "${HOME}/.ssh/config.d/20-sulandra-github.conf" 0600 <<EOF
Host github.com
  HostName ssh.github.com
  Port 443
  User git
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  ProxyCommand /usr/bin/nc -X connect -x ${proxy_authority} %h %p
EOF

touch "${HOME}/.ssh/config"
chmod 0600 "${HOME}/.ssh/config"
if ! grep -Fqx 'Include config.d/*' "${HOME}/.ssh/config"; then
  temporary="$(mktemp "${HOME}/.ssh/.config.XXXXXX")"
  printf '%s\n' 'Include config.d/*' > "${temporary}"
  sed -n '1,$p' "${HOME}/.ssh/config" >> "${temporary}"
  chmod 0600 "${temporary}"
  mv -f "${temporary}" "${HOME}/.ssh/config"
fi

if [[ ! -e "${HOME}/.bashrc" ]]; then
  write_private "${HOME}/.bashrc" 0600 <<'EOF'
[[ -r /agent/bashrc ]] && source /agent/bashrc
EOF
fi
install -m 0600 /agent/profile "${HOME}/.profile"

export HTTP_PROXY="${PROXY_URL}" HTTPS_PROXY="${PROXY_URL}"
export http_proxy="${PROXY_URL}" https_proxy="${PROXY_URL}"
export NODE_USE_ENV_PROXY=1
export NO_PROXY='localhost,127.0.0.1,::1' no_proxy='localhost,127.0.0.1,::1'
