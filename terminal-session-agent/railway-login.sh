#!/usr/bin/env bash
set -euo pipefail

[[ -r "${HOME}/.config/sulandra/proxy.env" ]] && source "${HOME}/.config/sulandra/proxy.env"
railway login --browserless
railway whoami

