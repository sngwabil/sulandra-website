#!/usr/bin/env bash
set -euo pipefail

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  sulandra-github-login
fi

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  echo "No active Git branch." >&2
  exit 1
fi

base="${SULANDRA_BASE_BRANCH:-release/sulandra-1.0}"
git push -u origin "$branch"
exec gh pr create --base "$base" --head "$branch" "$@"
