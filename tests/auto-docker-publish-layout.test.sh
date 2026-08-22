#!/usr/bin/env bash
set -euo pipefail

workflow_file="${WORKFLOW_FILE:-$(dirname "$0")/../.github/workflows/auto-docker-publish.yml}"
prepare_job="$(sed -n '/^  prepare:/,/^  publish-source-image:/p' "${workflow_file}")"
source_identity_step="$(sed -n '/^      - name: Record pre-sanitization source SHA/,/^      - name: Sanitize generated branch/p' <<<"${prepare_job}")"
source_job="$(sed -n '/^  publish-source-image:/,/^  publish-mod-images:/p' "${workflow_file}")"

assert_prepare_contains() {
  local expected="$1"
  if ! grep -Fqx "${expected}" <<<"${prepare_job}"; then
    printf 'prepare workflow is missing: %s\n' "${expected}" >&2
    exit 1
  fi
}

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

if ! grep -Fqx '      patchset_sha: ${{ steps.patchset.outputs.sha }}' <<<"${prepare_job}"; then
  printf 'prepare must expose the checked-out patchset SHA\n' >&2
  exit 1
fi

assert_prepare_contains "          ref: \${{ github.event_name == 'workflow_dispatch' && inputs.publish_mode == 'dev' && inputs.patchset_ref || 'patchset' }}"
assert_prepare_contains '        id: source_identity'
assert_prepare_contains '      - name: Sanitize generated branch'
assert_prepare_contains '      - name: Resolve upstream source ref'
assert_prepare_contains '        id: upstream_ref'
assert_prepare_contains "          ref: \${{ steps.upstream_ref.outputs.ref }}"
assert_prepare_contains '          EVENT_NAME: ${{ github.event_name }}'
assert_prepare_contains '          if [[ "${EVENT_NAME}" != "workflow_dispatch" && "${version}" == *-* ]]; then'
assert_prepare_contains '            PUBLISH_MODE=prerelease'
assert_prepare_contains "        if: steps.meta.outputs.publish_mode == 'dev' || steps.meta.outputs.publish_mode == 'prerelease'"
assert_prepare_contains '          SOURCE_SHA: ${{ steps.meta.outputs.source_sha }}'
assert_prepare_contains '          mapfile -t immutable_tags < <(docker_publish_immutable_tags "${PUBLISH_MODE}" "${RESOLVED_VERSION}" "${SOURCE_SHA}" "${UPSTREAM_SHA}")'
if ! grep -Fxq '          - prerelease' "${workflow_file}"; then
  printf 'workflow dispatch must expose prerelease publish mode\n' >&2
  exit 1
fi
if ! grep -Fqx '        default: ""' "${workflow_file}"; then
  printf 'workflow dispatch must allow prerelease resolution without an upstream ref\n' >&2
  exit 1
fi
if ! grep -Fqx "            upstream_ref=\"\$(gh api 'repos/getpaseo/paseo/releases?per_page=100' --jq '[.[] | select(.prerelease and (.draft | not))] | max_by(.published_at).tag_name')\"" "${workflow_file}"; then
  printf 'workflow must resolve the latest published upstream prerelease dynamically\n' >&2
  exit 1
fi
if ! grep -Fqx '        run: echo "sha=$(git rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"' <<<"${source_identity_step}"; then
  printf 'source identity must record the abbreviated post-patch SHA before sanitation\n' >&2
  exit 1
fi

source_identity_line="$(grep -nF -m1 '        id: source_identity' <<<"${prepare_job}" | cut -d: -f1)"
sanitization_line="$(grep -nF -m1 '      - name: Sanitize generated branch' <<<"${prepare_job}" | cut -d: -f1)"
if [[ -z "${source_identity_line}" || -z "${sanitization_line}" || "${source_identity_line}" -ge "${sanitization_line}" ]]; then
  printf 'source identity must be captured before generated-source sanitation\n' >&2
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
