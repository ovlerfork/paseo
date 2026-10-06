#!/usr/bin/env bash
set -euo pipefail

script_file="${SCRIPT_FILE:-$(dirname "$0")/../scripts/prepare-release-assets.py}"
workspace="$(mktemp -d)"
trap 'rm -rf "${workspace}"' EXIT

make_fixture() {
  local version="$1"
  local channel="$2"
  local root="$3"
  mkdir -p "${root}/release-windows-${version}-source" "${root}/release-linux-${version}-source" \
    "${root}/release-macos-arm64-${version}-source" \
    "${root}/release-ios-${version}-source"
  for name in "Paseo-Setup-${version}-x64.exe" "Paseo-Setup-${version}-arm64.exe"; do
    : >"${root}/release-windows-${version}-source/${name}"
  done
  : >"${root}/release-linux-${version}-source/Paseo-x86_64.AppImage"
  : >"${root}/release-macos-arm64-${version}-source/Paseo-${version}-arm64.zip"
  : >"${root}/release-ios-${version}-source/Paseo-${version}-ios-unsigned.ipa"
  cat >"${root}/release-windows-${version}-source/${channel}.yml" <<EOF
files:
  - url: Paseo-Setup-${version}-x64.exe
  - url: Paseo-Setup-${version}-arm64.exe
EOF
  cat >"${root}/release-linux-${version}-source/${channel}-linux.yml" <<EOF
files:
  - url: Paseo-x86_64.AppImage
EOF
  cat >"${root}/release-macos-arm64-${version}-source/${channel}-mac.yml" <<EOF
files:
  - url: Paseo-${version}-arm64.zip
    sha512: arm
path: Paseo-${version}-arm64.zip
sha512: arm
EOF
}

for channel in latest beta dev; do
  if [[ "${channel}" != latest ]]; then
    version="0.10.1-beta.1"
  else
    version="0.10.1"
  fi
  root="${workspace}/${channel}"
  make_fixture "${version}" "${channel}" "${root}"
  python3 "${script_file}" --artifacts "${root}" --output "${root}/out" --version "${version}" --channel "${channel}"
  test -f "${root}/out/${channel}.yml"
  test -f "${root}/out/${channel}-linux.yml"
  test -f "${root}/out/${channel}-mac.yml"
  test -f "${root}/out/Paseo-Setup-${version}-x64.exe"
  test -f "${root}/out/Paseo-${version}-arm64.zip"
  grep -Fqx "path: Paseo-${version}-arm64.zip" "${root}/out/${channel}-mac.yml"
done

printf 'release asset preparation handles latest, beta, and dev metadata\n'
