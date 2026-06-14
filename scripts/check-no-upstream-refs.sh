#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/.."

SCAN_TARGETS=(
  "$REPO_ROOT/patches"
  "$REPO_ROOT/scripts"
  "$REPO_ROOT/.github"
  "$REPO_ROOT/PATCHES.md"
)

FORBIDDEN_PATTERNS=(
  '#[0-9]+'
  'PR[[:space:]]*#[0-9]+'
  'pull request[[:space:]]*#[0-9]+'
  'issue[[:space:]]*#[0-9]+'
  '/issues/[0-9]+'
  '/pull/[0-9]+'
)

FOUND=0
for target in "${SCAN_TARGETS[@]}"; do
  [ -e "$target" ] || continue
  for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    MATCHES=$(grep -rnE "$pattern" "$target" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      echo "FORBIDDEN PATTERN: $pattern"
      echo "$MATCHES"
      echo ""
      FOUND=1
    fi
  done
done

if [ "$FOUND" -eq 1 ]; then
  echo "ERROR: Found forbidden issue/PR references in patchset metadata."
  exit 1
fi

echo "Sanitizer passed."
