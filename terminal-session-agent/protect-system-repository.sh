#!/usr/bin/env bash
set -euo pipefail

repository="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "${repository}" ]]; then
  repository="$(cd "${repository}" && pwd -P)"
fi
case "${repository}" in
  /workspace|/workspace/*)
    printf 'Sulandra Codebase guard: %s is blocked for /workspace. Work in /projects instead.\n' "$(basename "$0")" >&2
    exit 1
    ;;
esac

