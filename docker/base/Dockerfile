# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24.16.0-bookworm-slim
ARG RUNTIME_IMAGE=node:24.16.0-bookworm-slim
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS source-pack

ARG PASEO_VERSION

ENV ONNXRUNTIME_NODE_INSTALL=skip

WORKDIR /tmp/paseo-src
COPY . .

RUN set -eux; \
    if [ -n "${PASEO_VERSION:-}" ]; then \
      test "$(node -p "require('./package.json').version")" = "${PASEO_VERSION}"; \
    fi; \
    node -e 'const fs=require("node:fs"); const pkg=JSON.parse(fs.readFileSync("package.json","utf8")); delete pkg.scripts.prepare; fs.writeFileSync("package.json", `${JSON.stringify(pkg)}\n`);'; \
    npm ci

RUN set -eux; \
    mkdir -p /tmp/paseo-packs; \
    npm pack --workspace=@getpaseo/highlight --pack-destination /tmp/paseo-packs; \
    npm pack --workspace=@getpaseo/relay --pack-destination /tmp/paseo-packs; \
    npm pack --workspace=@getpaseo/protocol --pack-destination /tmp/paseo-packs; \
    npm pack --workspace=@getpaseo/client --pack-destination /tmp/paseo-packs; \
    npm pack --workspace=@getpaseo/server --pack-destination /tmp/paseo-packs; \
    npm pack --workspace=@getpaseo/cli --pack-destination /tmp/paseo-packs

FROM ${RUNTIME_IMAGE}

ARG COREPACK_VERSION=0.35.0
ARG GH_CLI_KEYRING_SHA256=6084d5d7bd8e288441e0e94fc6275570895da18e6751f70f057485dc2d1a811b
ARG NODE_VERSION=24.16.0
ARG NPM_VERSION=11.17.0
ARG PASEO_RUNTIME_USER=paseo
ARG PNPM_VERSION=11.6.0
ARG UV_VERSION=0.11.21

ENV HOME=/home/paseo \
    PASEO_HOME=/home/paseo/.paseo \
    PASEO_LISTEN=0.0.0.0:6767 \
    PASEO_WEB_UI_ENABLED=true \
    PASEO_LOG_FORMAT=json \
    PASEO_LOG_LEVEL=info \
    CLAUDE_CONFIG_DIR=/home/paseo/.claude \
    CODEX_HOME=/home/paseo/.codex \
    XDG_CONFIG_HOME=/home/paseo/.config \
    XDG_DATA_HOME=/home/paseo/.local/share \
    XDG_STATE_HOME=/home/paseo/.local/state \
    XDG_CACHE_HOME=/home/paseo/.cache \
    ONNXRUNTIME_NODE_INSTALL=skip \
    PASEO_RUNTIME_USER=${PASEO_RUNTIME_USER}

RUN set -eux; \
    case "${PASEO_RUNTIME_USER}" in paseo|root) ;; *) echo "Unsupported PASEO_RUNTIME_USER=${PASEO_RUNTIME_USER}" >&2; exit 1 ;; esac; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl; \
    keyring_tmp="$(mktemp)"; \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o "${keyring_tmp}"; \
    printf '%s  %s\n' "${GH_CLI_KEYRING_SHA256}" "${keyring_tmp}" | sha256sum -c -; \
    install -m 0755 -d /etc/apt/keyrings /etc/apt/sources.list.d; \
    install -m 0644 "${keyring_tmp}" /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
    rm -f "${keyring_tmp}"; \
    printf '%s\n' "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bash \
      bubblewrap \
      fd-find \
      gh \
      git \
      gosu \
      inotify-tools \
      lbzip2 \
      less \
      openssh-client \
      pipx \
      procps \
      python3-venv \
      ripgrep \
      rsync \
      tini \
      unzip \
      vim-tiny \
      xz-utils \
      zip; \
    if ! command -v node >/dev/null 2>&1; then \
      case "$(dpkg --print-architecture)" in amd64) node_arch=x64 ;; arm64) node_arch=arm64 ;; *) echo "Unsupported Node architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; esac; \
      node_archive="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
      node_tmp="$(mktemp -d)"; \
      curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o "${node_tmp}/SHASUMS256.txt"; \
      curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${node_archive}" -o "${node_tmp}/${node_archive}"; \
      (cd "${node_tmp}" && grep " ${node_archive}$" SHASUMS256.txt | sha256sum -c -); \
      tar -C /usr/local --strip-components=1 -xJf "${node_tmp}/${node_archive}"; \
      rm -rf "${node_tmp}"; \
    fi; \
    if command -v fdfind >/dev/null 2>&1 && ! command -v fd >/dev/null 2>&1; then \
      ln -s /usr/bin/fdfind /usr/local/bin/fd; \
    fi; \
    npm install -g "npm@${NPM_VERSION}" "corepack@${COREPACK_VERSION}"; \
    corepack enable; \
    corepack install -g "pnpm@${PNPM_VERSION}"; \
    COREPACK_ENABLE_NETWORK=0 pnpm --version; \
    uv_arch="$(dpkg --print-architecture)"; \
    case "${uv_arch}" in amd64) uv_platform="x86_64-unknown-linux-gnu" ;; arm64) uv_platform="aarch64-unknown-linux-gnu" ;; *) echo "Unsupported uv architecture: ${uv_arch}" >&2; exit 1 ;; esac; \
    uv_archive="uv-${uv_platform}.tar.gz"; \
    uv_tmp="$(mktemp -d)"; \
    curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${uv_archive}" -o "${uv_tmp}/${uv_archive}"; \
    curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${uv_archive}.sha256" -o "${uv_tmp}/${uv_archive}.sha256"; \
    (cd "${uv_tmp}" && sha256sum -c "${uv_archive}.sha256"); \
    tar -C "${uv_tmp}" -xzf "${uv_tmp}/${uv_archive}"; \
    install -m 0755 "${uv_tmp}/uv-${uv_platform}/uv" /usr/local/bin/uv; \
    install -m 0755 "${uv_tmp}/uv-${uv_platform}/uvx" /usr/local/bin/uvx; \
    rm -rf "${uv_tmp}"; \
    node --version; \
    npm --version; \
    corepack --version; \
    gh --version | head -n 1; \
    command -v inotifywait >/dev/null; \
    uv --version; \
    rm -rf /var/lib/apt/lists/*

COPY --from=source-pack /tmp/paseo-packs /tmp/paseo-packs
RUN set -eux; \
    npm install -g --omit=optional /tmp/paseo-packs/*.tgz; \
    rm -rf /tmp/paseo-packs; \
    npm cache clean --force; \
    server_entry="$(npm root -g)/@getpaseo/server/dist/scripts/supervisor-entrypoint.js"; \
    test -f "$server_entry"; \
    printf '%s\n' "$server_entry" > /etc/paseo-server-entry; \
    node --check "$server_entry"

RUN set -eux; \
    case "${PASEO_RUNTIME_USER}" in paseo|root) ;; *) echo "Unsupported PASEO_RUNTIME_USER=${PASEO_RUNTIME_USER}" >&2; exit 1 ;; esac; \
    existing_group="$(getent group 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing_group" ] && [ "$existing_group" != "paseo" ]; then \
      groupmod --new-name paseo "$existing_group"; \
    elif [ -z "$existing_group" ]; then \
      groupadd --gid 1000 paseo; \
    fi; \
    existing_user="$(getent passwd 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing_user" ] && [ "$existing_user" != "paseo" ]; then \
      usermod --login paseo --gid paseo --home /home/paseo --shell /bin/bash "$existing_user"; \
    elif [ -z "$existing_user" ]; then \
      useradd --uid 1000 --gid paseo --create-home --home-dir /home/paseo --shell /bin/bash paseo; \
    fi; \
    if [ "${PASEO_RUNTIME_USER}" = "root" ]; then \
      runtime_home=/root; \
      runtime_owner=root:root; \
    else \
      runtime_home=/home/paseo; \
      runtime_owner=paseo:paseo; \
    fi; \
    mkdir -p \
      /workspace \
      "${runtime_home}/.paseo" \
      "${runtime_home}/.claude" \
      "${runtime_home}/.codex" \
      "${runtime_home}/.config" \
      "${runtime_home}/.local/share" \
      "${runtime_home}/.local/state" \
      "${runtime_home}/.cache"; \
    chown -R "${runtime_owner}" "${runtime_home}" /workspace; \
    if [ "${PASEO_RUNTIME_USER}" = "paseo" ]; then \
      chown -R paseo:paseo /home/paseo; \
    fi

COPY docker/base/rootfs/ /
RUN chmod +x /usr/local/bin/paseo-docker-entrypoint

WORKDIR /workspace

EXPOSE 6767
VOLUME ["/home/paseo"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const listen=process.env.PASEO_LISTEN||'0.0.0.0:6767'; const m=listen.match(/:(\\d+)$/); const port=m?Number(m[1]):6767; require('http').get({hostname:'127.0.0.1',port,path:'/api/health'},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/paseo-docker-entrypoint"]
