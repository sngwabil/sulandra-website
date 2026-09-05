#!/usr/bin/env bash
set -euo pipefail

[[ -r "${HOME}/.config/sulandra/proxy.env" ]] && source "${HOME}/.config/sulandra/proxy.env"
mode="${1:-https}"

case "${mode}" in
  https)
    if ! gh auth status --hostname github.com >/dev/null 2>&1; then
      echo 'Starting GitHub device authentication. Open the displayed URL and enter the one-time code.'
      gh auth login --hostname github.com --git-protocol https --web
    fi
    gh auth setup-git --hostname github.com
    gh auth status --hostname github.com
    echo 'GitHub HTTPS push and pull are now prompt-free, including after session recreation.'
    ;;
  ssh)
    install -d -m 0700 "${HOME}/.ssh"
    if [[ ! -f "${HOME}/.ssh/id_ed25519" ]]; then
      ssh-keygen -q -t ed25519 -a 100 -N '' \
        -C "$(git config --global user.email)" -f "${HOME}/.ssh/id_ed25519"
    fi
    chmod 0600 "${HOME}/.ssh/id_ed25519"
    chmod 0644 "${HOME}/.ssh/id_ed25519.pub"
    echo 'Add this key at GitHub Settings > SSH and GPG keys:'
    sed -n '1p' "${HOME}/.ssh/id_ed25519.pub"
    echo 'Then verify with: ssh -T git@github.com'
    ;;
  *)
    echo 'Usage: sulandra-github-login [https|ssh]' >&2
    exit 2
    ;;
esac

