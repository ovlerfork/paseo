#!/usr/bin/env bash
set -euo pipefail

workflow_file="${WORKFLOW_FILE:-$(dirname "$0")/../.github/workflows/auto-docker-publish.yml}"
source_job="$(sed -n '/^  publish-source-image:/,/^  publish-mod-images:/p' "${workflow_file}")"

assert_job_contains() {
  local expected="$1"
  if ! grep -Fqx "${expected}" <<<"${source_job}"; then
    printf 'workflow layout is missing: %s\n' "${expected}" >&2
    exit 1
  fi
}

assert_job_not_contains() {
  local unexpected="$1"
  if grep -Fqx "${unexpected}" <<<"${source_job}"; then
    printf 'workflow layout must not contain: %s\n' "${unexpected}" >&2
    exit 1
  fi
}

if ! grep -Fqx '      patchset_sha: ${{ steps.patchset.outputs.sha }}' "${workflow_file}"; then
  printf 'prepare must expose the checked-out patchset SHA\n' >&2
  exit 1
fi

assert_job_contains '          ref: ${{ needs.prepare.outputs.patched_sha }}'
assert_job_contains '          path: source'
assert_job_contains '          ref: ${{ needs.prepare.outputs.patchset_sha }}'
assert_job_contains '          path: policy'
assert_job_contains '          source "${GITHUB_WORKSPACE}/policy/.github/workflows/docker-publish-policy.sh"'
assert_job_contains '          context: source'
assert_job_contains '          file: source/docker/base/Dockerfile'
assert_job_not_contains '          source "${GITHUB_WORKSPACE}/.github/workflows/docker-publish-policy.sh"'
assert_job_not_contains '          path: source/policy'
assert_job_not_contains '          context: .'

printf 'auto docker publish checkout layout test passed\n'
