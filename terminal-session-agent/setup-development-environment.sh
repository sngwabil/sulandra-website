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

TERMINAL_UID="$(id -u)"
TERMINAL_GID="$(id -g)"
RECOVERY_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

root_exec() {
  if [[ "${TERMINAL_UID}" == "0" ]]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

next_recovery_path() {
  local target="$1"
  local candidate="${target}.sulandra-recovery-${RECOVERY_STAMP}"
  local suffix=0
  while root_exec test -e "${candidate}" || root_exec test -L "${candidate}"; do
    suffix=$((suffix + 1))
    candidate="${target}.sulandra-recovery-${RECOVERY_STAMP}-${suffix}"
  done
  printf '%s\n' "${candidate}"
}

backup_conflict() {
  local target="$1"
  local backup
  backup="$(next_recovery_path "${target}")"
  root_exec mv -- "${target}" "${backup}"
  root_exec chown -h "${TERMINAL_UID}:${TERMINAL_GID}" "${backup}" 2>/dev/null || true
  printf 'Sulandra Codebase recovered incompatible persistent path: %s -> %s\n' "${target}" "${backup}" >&2
}

ensure_directory() {
  local target="$1"
  local mode="${2:-0700}"
  if root_exec test -L "${target}"; then
    backup_conflict "${target}"
  elif root_exec test -e "${target}" && ! root_exec test -d "${target}"; then
    backup_conflict "${target}"
  fi
  root_exec install -d -o "${TERMINAL_UID}" -g "${TERMINAL_GID}" -m "${mode}" "${target}"
}

ensure_file_target() {
  local target="$1"
  if root_exec test -L "${target}"; then
    backup_conflict "${target}"
  elif root_exec test -e "${target}" && ! root_exec test -f "${target}"; then
    backup_conflict "${target}"
  elif root_exec test -f "${target}"; then
    root_exec chown "${TERMINAL_UID}:${TERMINAL_GID}" "${target}"
  fi
}

# Existing Codebase workspaces can outlive many session images. Repair only the
# runtime-owned directory/file shapes needed to boot a new terminal; user project
# content and saved authentication data are preserved. This specifically prevents
# stale/root-owned home state from killing the session agent before /health starts.
ensure_directory "${HOME}" 0700
ensure_directory "${PROJECTS_DIR}" 0755
ensure_directory "${HOME}/.config" 0700
ensure_directory "${HOME}/.config/git" 0700
ensure_directory "${HOME}/.config/pip" 0700
ensure_directory "${HOME}/.config/sulandra" 0700
ensure_directory "${HOME}/.cargo" 0700
ensure_directory "${HOME}/.ssh" 0700
ensure_directory "${HOME}/.ssh/config.d" 0700
ensure_directory "${HOME}/.local" 0700
ensure_directory "${HOME}/.local/state" 0700
ensure_directory "${HOME}/.local/state/sulandra-terminal" 0700
ensure_directory "${HOME}/.local/state/sulandra-terminal/history" 0700

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

write_private() {
  local target="$1"
  local mode="$2"
  local temporary
  ensure_file_target "${target}"
  temporary="$(mktemp "$(dirname "${target}")/.sulandra.XXXXXX")"
  tee "${temporary}" >/dev/null
  chmod "${mode}" "${temporary}"
  mv -f -- "${temporary}" "${target}"
}

# The tmux config used to be copied by Docker CMD before this recovery script ran.
# On a persistent home, one stale/root-owned .tmux.conf was therefore enough to
# prevent the agent from starting at all. Install it only after home recovery.
write_private "${HOME}/.tmux.conf" 0600 < /agent/tmux.conf

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

# Preserve a valid user/global Git config, but quarantine an incompatible path or
# malformed file so platform defaults cannot trap every future session in a boot loop.
ensure_file_target "${HOME}/.gitconfig"
if [[ -s "${HOME}/.gitconfig" ]] && ! git config --global --list >/dev/null 2>&1; then
  backup_conflict "${HOME}/.gitconfig"
fi

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

ensure_file_target "${HOME}/.ssh/config"
touch "${HOME}/.ssh/config"
chmod 0600 "${HOME}/.ssh/config"
if ! grep -Fqx 'Include config.d/*' "${HOME}/.ssh/config"; then
  temporary="$(mktemp "${HOME}/.ssh/.config.XXXXXX")"
  printf '%s\n' 'Include config.d/*' > "${temporary}"
  sed -n '1,$p' "${HOME}/.ssh/config" >> "${temporary}"
  chmod 0600 "${temporary}"
  mv -f -- "${temporary}" "${HOME}/.ssh/config"
fi

# Keep the interactive shell bootstrap platform-owned so old Codebase images cannot
# leave an auto-cd or other stale startup command pointing at a project that was
# removed. Preserve any prior custom file beside it instead of deleting it.
BASHRC_MARKER='# SULANDRA_MANAGED_BASHRC_V2'
ensure_file_target "${HOME}/.bashrc"
if [[ -f "${HOME}/.bashrc" ]] && ! grep -Fqx "${BASHRC_MARKER}" "${HOME}/.bashrc"; then
  backup_conflict "${HOME}/.bashrc"
fi
write_private "${HOME}/.bashrc" 0600 <<'EOF'
# SULANDRA_MANAGED_BASHRC_V2
[[ -r /agent/bashrc ]] && source /agent/bashrc
# Put intentional personal additions in ~/.bashrc.local. Platform recovery never
# rewrites that file.
[[ -r "${HOME}/.bashrc.local" ]] && source "${HOME}/.bashrc.local"
EOF

write_private "${HOME}/.profile" 0600 < /agent/profile

export HTTP_PROXY="${PROXY_URL}" HTTPS_PROXY="${PROXY_URL}"
export http_proxy="${PROXY_URL}" https_proxy="${PROXY_URL}"
export NODE_USE_ENV_PROXY=1
export NO_PROXY='localhost,127.0.0.1,::1' no_proxy='localhost,127.0.0.1,::1'
