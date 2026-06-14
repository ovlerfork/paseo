#!/bin/sh
# Install base runtime dependencies + Node.js 24 LTS.
# Detects the package manager (apt vs apk) so one script covers all distros.
set -eu

install_node_tarball() {
  case "$(uname -m)" in
    x86_64) node_arch=x64 ;;
    aarch64) node_arch=arm64 ;;
    *)
      echo "Unsupported Node.js architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac

  node_dist_url="${NODE_DIST_URL:-https://nodejs.org/dist/v24.16.0}"
  node_tmp="$(mktemp -d)"
  sums_file="${node_tmp}/SHASUMS256.txt"

  curl -fsSL "${node_dist_url}/SHASUMS256.txt" -o "${sums_file}"
  node_archive="$(
    sed -n "s/^.*  \(node-v.*-linux-${node_arch}\.tar\.xz\)$/\1/p" "${sums_file}" | head -n 1
  )"

  if [ -z "${node_archive}" ]; then
    echo "Could not find Node.js linux-${node_arch} archive in ${node_dist_url}" >&2
    exit 1
  fi

  curl -fsSL "${node_dist_url}/${node_archive}" -o "${node_tmp}/${node_archive}"
  (cd "${node_tmp}" && grep "  ${node_archive}$" SHASUMS256.txt | sha256sum -c -)
  tar -C /usr/local --strip-components=1 -xJf "${node_tmp}/${node_archive}"
  rm -rf "${node_tmp}"
}

install_node_tooling() {
  pnpm_version="${PNPM_VERSION:-11.6.0}"
  corepack enable
  corepack prepare "pnpm@${pnpm_version}" --activate
}

install_uv() {
  uv_version="${UV_VERSION:-0.11.21}"
  case "$(uname -m)" in
    x86_64) uv_arch=x86_64 ;;
    aarch64) uv_arch=aarch64 ;;
    *)
      echo "Unsupported uv architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac

  uv_platform="${uv_arch}-unknown-linux-gnu"
  uv_archive="uv-${uv_platform}.tar.gz"
  uv_tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/astral-sh/uv/releases/download/${uv_version}/${uv_archive}" -o "${uv_tmp}/${uv_archive}"
  curl -fsSL "https://github.com/astral-sh/uv/releases/download/${uv_version}/${uv_archive}.sha256" -o "${uv_tmp}/${uv_archive}.sha256"
  (cd "${uv_tmp}" && sha256sum -c "${uv_archive}.sha256")
  tar -C "${uv_tmp}" -xzf "${uv_tmp}/${uv_archive}"
  install -m 0755 "${uv_tmp}/uv-${uv_platform}/uv" /usr/local/bin/uv
  install -m 0755 "${uv_tmp}/uv-${uv_platform}/uvx" /usr/local/bin/uvx
  rm -rf "${uv_tmp}"
}

install_debian_agent_tooling() {
  keyring_tmp="$(mktemp)"
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o "${keyring_tmp}"
  printf '%s  %s\n' \
    '6084d5d7bd8e288441e0e94fc6275570895da18e6751f70f057485dc2d1a811b' \
    "${keyring_tmp}" | sha256sum -c -
  install -m 0755 -d /etc/apt/keyrings /etc/apt/sources.list.d
  install -m 0644 "${keyring_tmp}" /etc/apt/keyrings/githubcli-archive-keyring.gpg
  rm -f "${keyring_tmp}"
  printf '%s\n' \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list

  apt-get update
  apt-get install -y --no-install-recommends \
    fd-find \
    gh \
    less \
    openssh-client \
    pipx \
    python3-venv \
    ripgrep \
    rsync \
    unzip \
    vim-tiny \
    zip

  install_uv
  install_node_tooling
}

if command -v apk >/dev/null 2>&1; then
  # Alpine. nodejs/npm come from the distro repos.
  apk add --no-cache \
    bash \
    bubblewrap \
    bzip2 \
    ca-certificates \
    curl \
    git \
    jq \
    nodejs \
    npm \
    procps \
    shadow \
    sudo \
    tar \
    tini \
    xz
elif command -v apt-get >/dev/null 2>&1; then
  # Debian / Ubuntu. Install Node from the official tarball instead of the
  # NodeSource .deb: arm64 apt package triggers have been flaky under QEMU in
  # GitHub Actions multi-arch builds.
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    bubblewrap \
    bzip2 \
    ca-certificates \
    curl \
    git \
    gnupg \
    jq \
    lbzip2 \
    procps \
    sudo \
    xz-utils
  install_node_tarball
  if [ "${PASEO_RUNTIME_USER:-paseo}" = "root" ]; then
    install_debian_agent_tooling
  fi
  apt-get clean
  rm -rf /var/lib/apt/lists/*
elif command -v pacman >/dev/null 2>&1; then
  # Arch Linux. Rolling repos ship the current Node. Full upgrade because
  # Arch does not support partial upgrades (avoids keyring/signature breakage).
  # --disable-sandbox: pacman 7's download sandbox needs seccomp, which fails
  # under qemu emulation (amd64-on-arm64 local builds); pointless in an
  # ephemeral image build anyway.
  pacman -Syu --noconfirm --needed --disable-sandbox \
    bubblewrap \
    ca-certificates \
    curl \
    git \
    jq \
    bzip2 \
    lbzip2 \
    nodejs \
    npm \
    procps-ng \
    shadow \
    sudo \
    tar \
    xz
  pacman -Scc --noconfirm >/dev/null 2>&1 || true
  rm -rf /var/cache/pacman/pkg/*
else
  echo "Unsupported base image: no apk, apt-get or pacman found" >&2
  exit 1
fi

node --version
npm --version
if command -v gh >/dev/null 2>&1; then
  gh --version | head -n 1
fi
if command -v uv >/dev/null 2>&1; then
  uv --version
fi
if command -v pnpm >/dev/null 2>&1; then
  pnpm --version
fi
