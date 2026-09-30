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
assert_prepare_contains '            publish_mode=prerelease'
assert_prepare_contains '            publish_mode=dev'
assert_prepare_contains '          elif [[ "${publish_mode}" == "dev" ]]; then'
assert_prepare_contains '            upstream_ref=main'
assert_prepare_contains '          elif [[ "${publish_mode}" == "prerelease" ]]; then'
assert_prepare_contains '          PUBLISH_MODE: ${{ steps.upstream_ref.outputs.publish_mode }}'
assert_prepare_contains '          version="${source_version}"'

assert_equals() {
  local expected="$1"
  local actual="$2"
  local name="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    printf '%s failed: expected %s, got %s\n' "${name}" "${expected}" "${actual}" >&2
    exit 1
  fi
}

metadata_script="$(sed -n '/^      - name: Resolve metadata$/,/^      - name: Create immutable release source tag$/p' "${workflow_file}" | sed -n '/^        run: |$/,/^$/ { /^          / { s/^          //; p; } }')"
metadata_source="$(mktemp -d)"
metadata_output="${metadata_source}/output"
trap 'rm -rf "${metadata_source}"' EXIT
printf '{"version":"1.2.3"}\n' >"${metadata_source}/package.json"
git -C "${metadata_source}" init --quiet
git -C "${metadata_source}" config user.name test
git -C "${metadata_source}" config user.email test@example.invalid
git -C "${metadata_source}" add package.json
git -C "${metadata_source}" commit --quiet -m source

run_metadata() {
  local input_version="$1"
  : >"${metadata_output}"
  (
    cd "${metadata_source}"
    GITHUB_OUTPUT="${metadata_output}" \
      INPUT_PASEO_VERSION="${input_version}" \
      PUBLISH_MODE=release \
      REPO_OWNER=Example \
      UPSTREAM_SHA=upstream-sha \
      SOURCE_SHA=source-sha \
      bash -c "${metadata_script}"
  )
}

run_metadata ''
assert_equals 'version=1.2.3' "$(grep -Fx 'version=1.2.3' "${metadata_output}")" \
  'empty paseo_version uses source package version'
run_metadata 1.2.3
assert_equals 'version=1.2.3' "$(grep -Fx 'version=1.2.3' "${metadata_output}")" \
  'matching paseo_version is accepted'
if run_metadata 9.9.9 >/dev/null 2>&1; then
  printf 'mismatched paseo_version must fail metadata resolution\n' >&2
  exit 1
fi

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
if ! grep -Fqx "            upstream_ref=\"\$(gh api --paginate 'repos/getpaseo/paseo/releases?per_page=100' | jq --slurp -r '[.[][] | select(.draft | not)] | max_by(.published_at).tag_name')\"" "${workflow_file}"; then
  printf 'workflow must resolve the latest published upstream release or prerelease dynamically\n' >&2
  exit 1
fi
if ! grep -Fqx "            upstream_ref=\"\$(gh api --paginate 'repos/getpaseo/paseo/releases?per_page=100' | jq --slurp -r '[.[][] | select((.prerelease | not) and (.draft | not))] | max_by(.published_at).tag_name')\"" "${workflow_file}"; then
  printf 'workflow must resolve the latest published upstream stable release dynamically\n' >&2
  exit 1
fi

newer_prerelease_pages='[{"tag_name":"v0.5.0","prerelease":false,"draft":false,"published_at":"2026-08-01T00:00:00Z"},{"tag_name":"v0.6.0-beta.1","prerelease":true,"draft":false,"published_at":"2026-08-02T00:00:00Z"}]'
release_pages='[{"tag_name":"v0.5.0","prerelease":false,"draft":false,"published_at":"2026-08-01T00:00:00Z"},{"tag_name":"v0.6.0-beta.1","prerelease":true,"draft":false,"published_at":"2026-08-02T00:00:00Z"},{"tag_name":"v0.6.0","prerelease":false,"draft":false,"published_at":"2026-08-03T00:00:00Z"},{"tag_name":"v0.7.0-beta.1","prerelease":true,"draft":true,"published_at":"2026-08-04T00:00:00Z"}]'
assert_equals v0.6.0-beta.1 \
  "$(printf '%s\n' "${newer_prerelease_pages}" | jq --slurp -r '[.[][] | select(.draft | not)] | max_by(.published_at).tag_name')" \
  "prerelease source selects a newer prerelease over an older stable release"
assert_equals v0.6.0 \
  "$(printf '%s\n' "${release_pages}" | jq --slurp -r '[.[][] | select(.draft | not)] | max_by(.published_at).tag_name')" \
  "prerelease source selects a newer stable release over an older prerelease"
assert_equals v0.6.0 \
  "$(printf '%s\n' "${release_pages}" | jq --slurp -r '[.[][] | select((.prerelease | not) and (.draft | not))] | max_by(.published_at).tag_name')" \
  "release source selects the newest non-draft stable release"
if grep -Fq 'gh api --paginate --slurp' "${workflow_file}"; then
  printf 'workflow must not combine unsupported gh api --paginate --slurp flags\n' >&2
  exit 1
fi
if grep -Fq 'publish_mode="${version}"' "${workflow_file}"; then
  printf 'workflow must select publish mode from the upstream ref policy, not package metadata\n' >&2
  exit 1
fi
if ! grep -Fqx '        run: echo "sha=$(git rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"' <<<"${source_identity_step}"; then
  printf 'source identity must record the abbreviated post-patch SHA before sanitation\n' >&2
  exit 1
fi

assert_prepare_contains '            git am --3way --committer-date-is-author-date "$patch"'
assert_prepare_contains '              commit_date="$(git show -s --format=%aI HEAD)"'
assert_prepare_contains '              GIT_AUTHOR_DATE="${commit_date}" GIT_COMMITTER_DATE="${commit_date}" \'

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
release_job="$(sed -n '/^  publish-release:/,$p' "${workflow_file}")"

assert_release_contains() {
  local expected="$1"
  if ! grep -Fqx "${expected}" <<<"${release_job}"; then
    printf 'release workflow is missing: %s\n' "${expected}" >&2
    exit 1
  fi
}

assert_prepare_contains '      release_tag: ${{ steps.meta.outputs.release_tag }}'
assert_prepare_contains '          release_tag="v${version}-source-${source_sha}"'
assert_prepare_contains '          if [[ "${PUBLISH_MODE}" != "release" ]]; then'
assert_prepare_contains '            release_tag="${release_tag}-${PUBLISH_MODE}"'
assert_prepare_contains '            release_channel=beta'
assert_prepare_contains '            release_channel=latest'
assert_prepare_contains '      - name: Create immutable release source tag'
assert_prepare_contains "        if: steps.publish.outputs.value == 'false'"
assert_prepare_contains '          name: patched-source'
assert_prepare_contains '          RELEASE_TAG: ${{ steps.meta.outputs.release_tag }}'
assert_prepare_contains '            if grep -Fxq "Paseo-Setup-${VERSION}-x64.exe" <<<"${assets}" \'
assert_prepare_contains '              && grep -Fxq "Paseo-${VERSION}-x64.tar.gz" <<<"${assets}" \'
if [[ -f "$(dirname "${workflow_file}")/auto-desktop-build.yml" ]]; then
  printf 'desktop builds must run from the release workflow, not a separate source preparation workflow\n' >&2
  exit 1
fi
for job in build-linux build-windows build-macos build-ios; do
  job_body="$(sed -n "/^  ${job}:/,/^  [a-z].*:/p" "${workflow_file}")"
  if ! grep -Fqx '          ref: ${{ needs.prepare.outputs.patched_sha }}' <<<"${job_body}"; then
    printf '%s must build the same sanitized patched source as GHCR\n' "${job}" >&2
    exit 1
  fi
  if ! grep -Fqx '          name: patched-source' <<<"${job_body}"; then
    printf '%s must be able to build the dry-run source without a branch push\n' "${job}" >&2
    exit 1
  fi
  if ! grep -Fqx '      - name: Initialize Git metadata for a dry run' <<<"${job_body}" \
    || ! grep -Fqx "        if: needs.prepare.outputs.publish == 'false'" <<<"${job_body}" \
    || ! grep -Fqx '        run: git init --quiet' <<<"${job_body}"; then
    printf '%s must initialize isolated Git metadata before its dry-run npm lifecycle scripts\n' "${job}" >&2
    exit 1
  fi
done

job_condition() {
  local job="$1"
  awk -v job="${job}" '
    $0 ~ "^  " job ":" { in_job = 1; next }
    in_job && $0 ~ /^  [a-z][a-z-]*:/ { exit }
    in_job && /^    if:/ { in_condition = 1; sub(/^    if: ?/, ""); printf "%s ", $0; next }
    in_condition && /^      / { sub(/^      /, ""); printf "%s ", $0; next }
    in_condition { exit }
  ' "${workflow_file}"
}

for job in build-linux build-windows build-macos build-ios; do
  condition="$(job_condition "${job}")"
  for requirement in \
    "needs.prepare.outputs.release_needed == 'true'" \
    "needs.prepare.outputs.publish == 'false'"; do
    if [[ "${condition}" != *"${requirement}"* ]]; then
      printf '%s must build clients when release assets are needed: missing %s\n' "${job}" "${requirement}" >&2
      exit 1
    fi
  done
done
macos_job="$(sed -n '/^  build-macos:/,/^  build-ios:/p' "${workflow_file}")"
ios_job="$(sed -n '/^  build-ios:/,/^  publish-release:/p' "${workflow_file}")"
if ! grep -Fqx '          NODE_OPTIONS: --max-old-space-size=4096' <<<"${macos_job}"; then
  printf 'macOS desktop build must raise the observed V8 old-space ceiling\n' >&2
  exit 1
fi
if ! grep -Fqx '      - name: Select supported Xcode' <<<"${ios_job}" \
  || ! grep -Fqx '        run: sudo xcode-select --switch /Applications/Xcode_16.2.app/Contents/Developer' <<<"${ios_job}"; then
  printf 'iOS build must select the Xcode version required by locked React Native\n' >&2
  exit 1
fi

assert_release_contains "    needs: [prepare, publish-source-image, build-linux, build-windows, build-macos, build-ios]"
assert_release_contains '          path: release-policy'
assert_release_contains '        run: python3 -m pip install --disable-pip-version-check "PyYAML==6.0.2"'
assert_release_contains '          --channel "${RELEASE_CHANNEL}"'
assert_release_contains '          RELEASE_CHANNEL: ${{ needs.prepare.outputs.release_channel }}'
assert_release_contains '          image_tag="${VERSION}-${SOURCE_SHA}"'
assert_release_contains '          if [[ "${PUBLISH_MODE}" == "dev" ]]; then'
assert_release_contains '            image_tag="dev-${UPSTREAM_SHA}-source-${SOURCE_SHA}"'
assert_release_contains '          if [[ "${PUBLISH_MODE}" != "release" ]]; then'
if ! grep -Fq 'ghcr.io/%s/paseo:%s' <<<"${release_job}"; then
  printf 'release notes must identify the matching immutable GHCR image\n' >&2
  exit 1
fi

printf 'auto docker publish release workflow layout test passed\n'

updater_patch="$(dirname "${workflow_file}")/../../patches/cur/0013-fix-desktop-use-fork-github-releases.patch"
if ! grep -Fqx '+  owner: ovlerfork' "${updater_patch}"; then
  printf 'desktop updater patch must target the fork GitHub releases\n' >&2
  exit 1
fi

printf 'desktop updater release source test passed\n'
