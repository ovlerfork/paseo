#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/.."
PATCH_DIR="${PATCH_DIR:-${REPO_ROOT}/patches/cur}"

FORBIDDEN_PATTERNS=(
  '#[0-9]+'
  'PR[[:space:]]*#[0-9]+'
  'pull request[[:space:]]*#[0-9]+'
  'issue[[:space:]]*#[0-9]+'
  '/issues/[0-9]+'
  '/pull/[0-9]+'
)

if [ ! -d "${PATCH_DIR}" ]; then
  echo "Sanitizer passed."
  exit 0
fi

shopt -s nullglob
PATCHES=("${PATCH_DIR}"/*.patch)
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

FOUND=0
for patch in "${PATCHES[@]}"; do
  message_file="${TEMP_DIR}/message"
  diff_file="${TEMP_DIR}/diff"
  metadata="$(git mailinfo "${message_file}" "${diff_file}" < "${patch}")"
  metadata+=$'\n'
  metadata+="$(cat "${message_file}")"

  for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    if grep -qE "${pattern}" <<<"${metadata}"; then
      echo "FORBIDDEN PATTERN: ${pattern}"
      echo "${patch}"
      echo ""
      FOUND=1
    fi
  done
done

if [ "${FOUND}" -eq 1 ]; then
  echo "ERROR: Found forbidden issue/PR references in patch metadata."
  exit 1
fi

echo "Sanitizer passed."
