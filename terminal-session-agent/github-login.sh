#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not installed in this terminal image." >&2
  exit 1
fi

if gh auth status --hostname github.com >/dev/null 2>&1; then
  echo "GitHub authentication is already active for this terminal session."
else
  echo "Starting GitHub device/web authentication for this isolated terminal session."
  echo "Credentials are stored only in the terminal session's ephemeral home directory."
  gh auth login --hostname github.com --git-protocol https --web
fi

gh auth setup-git --hostname github.com

echo
printf 'Repository: %s\n' "${SULANDRA_REPOSITORY:-$(git remote get-url origin 2>/dev/null || echo unknown)}"
printf 'Branch: %s\n' "$(git branch --show-current 2>/dev/null || echo unknown)"
echo "Git push and gh pr create are now available for this session."
