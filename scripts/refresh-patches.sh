#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PATCH_DIR="${PATCH_DIR:-${SCRIPT_DIR}/../patches/cur}"
UPSTREAM_REF="${UPSTREAM_REF:-upstream/main}"

if ! git rev-parse "$UPSTREAM_REF" >/dev/null 2>&1; then
  echo "ERROR: $UPSTREAM_REF not found. Run: git fetch upstream main" >&2
  exit 1
fi

COMMIT_COUNT=$(git rev-list --count "$UPSTREAM_REF..HEAD")
if [ "$COMMIT_COUNT" -eq 0 ]; then
  echo "No commits on top of $UPSTREAM_REF. Nothing to export."
  exit 0
fi

if [ -d "$PATCH_DIR" ] && [ "$(ls -A "$PATCH_DIR" 2>/dev/null)" ]; then
  OLD_DIR="${SCRIPT_DIR}/../patches/old/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$OLD_DIR"
  mv "$PATCH_DIR"/*.patch "$OLD_DIR"/ 2>/dev/null || true
  echo "Archived previous patches to: $OLD_DIR"
fi

mkdir -p "$PATCH_DIR"

git format-patch \
  --zero-commit \
  --no-signature \
  --no-numbered \
  --no-stat \
  -o "$PATCH_DIR" \
  "$UPSTREAM_REF..HEAD"

echo ""
echo "Generated patches:"
ls -1 "$PATCH_DIR"/*.patch
echo ""
echo "Total: $(ls -1 "$PATCH_DIR"/*.patch | wc -l) patches"
