#!/usr/bin/env bash

docker_publish_source_tags() {
  local image_base="$1"
  local publish_mode="$2"
  local release_moving_tag="$3"
  local resolved_version="$4"
  local source_sha="$5"
  local upstream_sha="$6"
  local variant="$7"

  if [[ "${publish_mode}" == "dev" && -n "${variant}" ]]; then
    printf '%s\n%s\n' "${image_base}:dev-${variant}" "${image_base}:dev-${upstream_sha}-${variant}"
  elif [[ "${publish_mode}" == "dev" ]]; then
    printf '%s\n%s\n' "${image_base}:dev" "${image_base}:dev-${upstream_sha}"
  elif [[ "${publish_mode}" == "prerelease" && -n "${variant}" ]]; then
    printf '%s\n%s\n%s\n%s\n' "${image_base}:prerelease-${variant}" "${image_base}:prerelease-${source_sha}-${variant}" "${image_base}:${resolved_version}-${variant}" "${image_base}:${resolved_version}-${source_sha}-${variant}"
  elif [[ "${publish_mode}" == "prerelease" ]]; then
    printf '%s\n%s\n%s\n%s\n' "${image_base}:prerelease" "${image_base}:prerelease-${source_sha}" "${image_base}:${resolved_version}" "${image_base}:${resolved_version}-${source_sha}"
  elif [[ -n "${variant}" ]]; then
    printf '%s\n%s\n%s\n' "${image_base}:${resolved_version}-${variant}" "${image_base}:${resolved_version}-${source_sha}-${variant}" "${image_base}:${release_moving_tag}"
  else
    printf '%s\n%s\n%s\n' "${image_base}:${resolved_version}" "${image_base}:${resolved_version}-${source_sha}" "${image_base}:${release_moving_tag}"
  fi
}

docker_publish_source_images_needed() {
  local default_tag_exists="$1"
  local ubuntu_tag_exists="$2"

  if [[ "${default_tag_exists}" == "true" && "${ubuntu_tag_exists}" == "true" ]]; then
    printf 'false\n'
  else
    printf 'true\n'
  fi
}

docker_publish_immutable_tags() {
  local publish_mode="$1"
  local resolved_version="$2"
  local source_sha="$3"
  local upstream_sha="$4"

  if [[ "${publish_mode}" == "dev" ]]; then
    printf 'dev-%s\ndev-%s-ubuntu-sandbox\n' "${upstream_sha}" "${upstream_sha}"
  elif [[ "${publish_mode}" == "prerelease" ]]; then
    printf 'prerelease-%s\nprerelease-%s-ubuntu-sandbox\n' "${source_sha}" "${source_sha}"
  else
    printf '%s\n%s-ubuntu-sandbox\n' "${resolved_version}" "${resolved_version}"
  fi
}

docker_publish_existing_tags() {
  local package_path="$1"
  local tags_file
  local error_file
  local result

  tags_file="$(mktemp)"
  error_file="$(mktemp)"
  if gh api "${package_path}" --paginate --jq '.[] | .metadata.container.tags[]?' >"${tags_file}" 2>"${error_file}"; then
    cat "${tags_file}"
    result=0
  elif grep -Eq 'HTTP 404|status 404' "${error_file}"; then
    echo "The paseo container package does not exist yet." >&2
    result=0
  else
    cat "${error_file}" >&2
    result=1
  fi

  rm -f "${tags_file}" "${error_file}"
  return "${result}"
}
