#!/usr/bin/env bash
set -euo pipefail

policy_file="${POLICY_FILE:-$(dirname "$0")/../.github/workflows/docker-publish-policy.sh}"
source "${policy_file}"

readonly IMAGE_BASE="ghcr.io/example/paseo"
readonly VERSION="1.2.3"
readonly PRE_SANITIZATION_SHA="a1b2c3d"
readonly PATCHED_SHA="d4e5f6a"
readonly UPSTREAM_SHA="0123456789abcdef0123456789abcdef01234567"

assert_equals() {
  local expected="$1"
  local actual="$2"
  local name="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    printf '%s failed\nexpected:\n%s\nactual:\n%s\n' "${name}" "${expected}" "${actual}" >&2
    exit 1
  fi
}

assert_equals $'ghcr.io/example/paseo:dev\nghcr.io/example/paseo:dev-0123456789abcdef0123456789abcdef01234567' \
  "$(docker_publish_source_tags "${IMAGE_BASE}" dev latest "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}" '')" \
  "dev default tags"
assert_equals $'ghcr.io/example/paseo:dev-ubuntu-sandbox\nghcr.io/example/paseo:dev-0123456789abcdef0123456789abcdef01234567-ubuntu-sandbox' \
  "$(docker_publish_source_tags "${IMAGE_BASE}" dev ubuntu-sandbox "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}" ubuntu-sandbox)" \
  "dev Ubuntu tags"
assert_equals $'ghcr.io/example/paseo:prerelease\nghcr.io/example/paseo:prerelease-a1b2c3d\nghcr.io/example/paseo:1.2.3\nghcr.io/example/paseo:1.2.3-a1b2c3d' \
  "$(docker_publish_source_tags "${IMAGE_BASE}" prerelease latest "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}" '')" \
  "prerelease default tags retain the pre-sanitization source SHA without latest"
assert_equals $'ghcr.io/example/paseo:prerelease-ubuntu-sandbox\nghcr.io/example/paseo:prerelease-a1b2c3d-ubuntu-sandbox\nghcr.io/example/paseo:1.2.3-ubuntu-sandbox\nghcr.io/example/paseo:1.2.3-a1b2c3d-ubuntu-sandbox' \
  "$(docker_publish_source_tags "${IMAGE_BASE}" prerelease ubuntu-sandbox "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}" ubuntu-sandbox)" \
  "prerelease Ubuntu tags retain the pre-sanitization source SHA without the moving sandbox tag"
assert_equals $'ghcr.io/example/paseo:1.2.3\nghcr.io/example/paseo:1.2.3-a1b2c3d\nghcr.io/example/paseo:latest' \
  "$(docker_publish_source_tags "${IMAGE_BASE}" release latest "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}" '')" \
  "release default tags retain the pre-sanitization source SHA"
assert_equals $'ghcr.io/example/paseo:1.2.3-ubuntu-sandbox\nghcr.io/example/paseo:1.2.3-a1b2c3d-ubuntu-sandbox\nghcr.io/example/paseo:ubuntu-sandbox' \
  "$(docker_publish_source_tags "${IMAGE_BASE}" release ubuntu-sandbox "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}" ubuntu-sandbox)" \
  "release Ubuntu tags"
assert_equals true "$(docker_publish_source_images_needed true false)" "missing Ubuntu immutable tag publishes"
assert_equals true "$(docker_publish_source_images_needed false true)" "missing default immutable tag publishes"
assert_equals true "$(docker_publish_source_images_needed false false)" "absent package publishes"
assert_equals $'dev-0123456789abcdef0123456789abcdef01234567\ndev-0123456789abcdef0123456789abcdef01234567-ubuntu-sandbox' \
  "$(docker_publish_immutable_tags dev "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}")" \
  "development immutable tags use the full upstream SHA"
assert_equals $'prerelease-a1b2c3d\nprerelease-a1b2c3d-ubuntu-sandbox' \
  "$(docker_publish_immutable_tags prerelease "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}")" \
  "prerelease immutable tags use the source identity"
assert_equals $'1.2.3\n1.2.3-ubuntu-sandbox' \
  "$(docker_publish_immutable_tags release "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}")" \
  "release immutable tags use the release version"

mapfile -t prerelease_immutable_tags < <(docker_publish_immutable_tags prerelease "${VERSION}" "${PRE_SANITIZATION_SHA}" "${UPSTREAM_SHA}")
existing_version_tags=$'1.2.3\n1.2.3-ubuntu-sandbox'
prerelease_default_tag_exists=false
prerelease_ubuntu_tag_exists=false
if grep -Fxq "${prerelease_immutable_tags[0]}" <<<"${existing_version_tags}"; then
  prerelease_default_tag_exists=true
fi
if grep -Fxq "${prerelease_immutable_tags[1]}" <<<"${existing_version_tags}"; then
  prerelease_ubuntu_tag_exists=true
fi
assert_equals true "$(docker_publish_source_images_needed "${prerelease_default_tag_exists}" "${prerelease_ubuntu_tag_exists}")" \
  "prerelease version tags without source tags publish"
assert_equals false "$(docker_publish_source_images_needed true true)" \
  "present prerelease source tags skip"

fake_bin="$(mktemp -d)"
trap 'rm -rf "${fake_bin}"' EXIT
cat >"${fake_bin}/gh" <<'EOF'
#!/usr/bin/env bash
case "${MOCK_GH_RESULT}" in
  present) printf 'dev-immutable\ndev-ubuntu-immutable\n' ;;
  absent) printf 'HTTP 404: Not Found\n' >&2; exit 1 ;;
  failure) printf 'HTTP 401: Bad credentials\n' >&2; exit 1 ;;
esac
EOF
chmod +x "${fake_bin}/gh"

PATH="${fake_bin}:${PATH}"
assert_equals $'dev-immutable\ndev-ubuntu-immutable' \
  "$(MOCK_GH_RESULT=present docker_publish_existing_tags packages/container/paseo/versions)" \
  "present immutable tags"
assert_equals '' \
  "$(MOCK_GH_RESULT=absent docker_publish_existing_tags packages/container/paseo/versions)" \
  "absent package is an empty tag set"
if MOCK_GH_RESULT=failure docker_publish_existing_tags packages/container/paseo/versions >/dev/null 2>&1; then
  printf 'API failures must not become an empty tag set\n' >&2
  exit 1
fi

if [[ "${PRE_SANITIZATION_SHA}" == "${PATCHED_SHA}" ]]; then
  printf 'test fixture must distinguish pre- and post-sanitization identities\n' >&2
  exit 1
fi

printf 'auto docker publish tag and deduplication policy tests passed\n'
