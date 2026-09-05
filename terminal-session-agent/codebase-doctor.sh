#!/usr/bin/env bash
set -u

deployment_mode=0
[[ "${1:-}" == "--deployment" ]] && deployment_mode=1
failures=0
warnings=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }
warn() { printf 'WARN  %s\n' "$1" >&2; warnings=$((warnings + 1)); }

projects_dir="${SULANDRA_TERMINAL_CWD:-/projects}"
proxy="${TERMINAL_EGRESS_PROXY_URL:-${HTTPS_PROXY:-${HTTP_PROXY:-}}}"

[[ -d "${projects_dir}" ]] && pass "${projects_dir} exists" || fail "${projects_dir} is missing"
if (( deployment_mode )); then
  [[ "$(pwd -P)" == "${projects_dir}" ]] && pass 'default working directory is /projects' || fail "default working directory is $(pwd -P)"
fi

for command in git gh railway node npm python3 pip3 cargo clangd pylsp typescript-language-server code-server; do
  command -v "${command}" >/dev/null 2>&1 && pass "${command} is installed" || fail "${command} is missing"
done

[[ "$(git config --global --get user.name 2>/dev/null)" == "${SULANDRA_GIT_USER_NAME:-Sulpitius Gwabil}" ]] \
  && pass 'Git user.name is configured' || fail 'Git user.name is missing or incorrect'
[[ "$(git config --global --get user.email 2>/dev/null)" == "${SULANDRA_GIT_USER_EMAIL:-Sulpitius.gwabil@gmail.com}" ]] \
  && pass 'Git user.email is configured' || fail 'Git user.email is missing or incorrect'
[[ -n "${proxy}" && "$(git config --global --get http.proxy 2>/dev/null)" == "${proxy}" ]] \
  && pass 'Git proxy is persistent' || fail 'Git proxy is missing or incorrect'
[[ "$(npm config get proxy 2>/dev/null)" == "${proxy}" ]] && pass 'npm proxy is persistent' || fail 'npm proxy is missing or incorrect'
grep -Fq "proxy = ${proxy}" "${HOME}/.config/pip/pip.conf" 2>/dev/null && pass 'pip proxy is persistent' || fail 'pip proxy is missing'
grep -Fq "proxy = \"${proxy}\"" "${HOME}/.cargo/config.toml" 2>/dev/null && pass 'Cargo proxy is persistent' || fail 'Cargo proxy is missing'
grep -Fq "Acquire::https::Proxy \"${proxy}\";" /etc/apt/apt.conf.d/90sulandra-proxy 2>/dev/null \
  && pass 'apt proxy is persistent' || fail 'apt proxy is missing'
[[ "$(git config --global --get 'includeIf.gitdir:/workspace/.git/.path' 2>/dev/null)" == '/etc/gitconfig-sulandra-workspace' ]] \
  && pass '/workspace Git mutation guard is active' || fail '/workspace Git mutation guard is missing'
grep -Fq 'terminal.integrated.cwd' /agent/entrypoint.sh 2>/dev/null && pass 'Code-Server terminal cwd is /projects' || fail 'Code-Server terminal cwd setting is missing'
grep -Fq 'cd "${SULANDRA_TERMINAL_CWD:-/projects}"' /agent/bashrc 2>/dev/null && pass 'Bash auto-cd hook is installed' || fail 'Bash auto-cd hook is missing'

if [[ -n "${proxy}" ]]; then
  getent hosts egress-proxy >/dev/null 2>&1 && pass 'egress-proxy DNS resolves' || fail 'egress-proxy DNS does not resolve'
  curl --proxy "${proxy}" --connect-timeout 8 --max-time 30 --fail --silent --show-error \
    --output /dev/null https://registry.npmjs.org/-/ping \
    && pass 'proxy reaches npm' || fail 'proxy cannot reach npm'
  curl --proxy "${proxy}" --connect-timeout 8 --max-time 30 --fail --silent --show-error \
    --output /dev/null https://pypi.org/pypi/pip/json \
    && pass 'proxy reaches PyPI' || fail 'proxy cannot reach PyPI'
  curl --proxy "${proxy}" --connect-timeout 8 --max-time 30 --fail --silent --show-error \
    --output /dev/null https://index.crates.io/config.json \
    && pass 'proxy reaches crates.io' || fail 'proxy cannot reach crates.io'
  GIT_CONFIG_GLOBAL=/dev/null git -c "http.proxy=${proxy}" ls-remote \
    https://github.com/sngwabil/sulandra-website.git HEAD >/dev/null 2>&1 \
    && pass 'proxy reaches GitHub Git' || fail 'proxy cannot reach GitHub Git'
  if railway_status="$(curl --proxy "${proxy}" --connect-timeout 8 --max-time 30 --silent --show-error \
    --output /dev/null --write-out '%{http_code}' https://backboard.railway.app/graphql/v2 2>/dev/null)"; then
    [[ "${railway_status}" != '000' ]] && pass "proxy reaches Railway API (HTTP ${railway_status})" || fail 'proxy cannot reach Railway API'
  else
    fail 'proxy cannot reach Railway API'
  fi
else
  fail 'proxy environment is missing'
fi

if (( deployment_mode )); then
  if env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
    curl --noproxy '*' --connect-timeout 3 --max-time 5 --silent --output /dev/null \
      https://registry.npmjs.org/-/ping; then
    fail 'direct internet egress bypasses the controlled proxy'
  else
    pass 'direct internet egress is blocked'
  fi
fi

gh auth status --hostname github.com >/dev/null 2>&1 \
  && pass 'GitHub authentication is active' || warn 'Run: sulandra-github-login'
railway whoami >/dev/null 2>&1 \
  && pass 'Railway authentication is active' || warn 'Run: railway login --browserless'

printf '\nCodebase doctor: %d failure(s), %d warning(s).\n' "${failures}" "${warnings}"
(( failures == 0 ))
