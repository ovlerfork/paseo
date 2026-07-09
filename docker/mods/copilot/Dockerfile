# syntax=docker/dockerfile:1
ARG BUSYBOX_IMAGE=busybox:1.37.0-uclibc
ARG PASEO_MOD_NAME=copilot
ARG PASEO_MOD_PACKAGE=@github/copilot
ARG PASEO_MOD_PACKAGE_VERSION=latest

FROM ${BUSYBOX_IMAGE} AS meta
ARG PASEO_MOD_NAME
ARG PASEO_MOD_PACKAGE
ARG PASEO_MOD_PACKAGE_VERSION
RUN set -eu; \
    install -d "/root-layer/etc/paseo-mods/${PASEO_MOD_NAME}"; \
    printf '%s\n' "${PASEO_MOD_PACKAGE}" > "/root-layer/etc/paseo-mods/${PASEO_MOD_NAME}/package"; \
    printf '%s\n' "${PASEO_MOD_PACKAGE_VERSION}" > "/root-layer/etc/paseo-mods/${PASEO_MOD_NAME}/package-version"

FROM scratch
ARG PASEO_MOD_NAME=copilot
ARG PASEO_MOD_PACKAGE=@github/copilot
ARG PASEO_MOD_PACKAGE_VERSION=latest
LABEL org.opencontainers.image.title="Paseo Docker Mod: ${PASEO_MOD_NAME}" \
      org.ovlerfork.paseo.mod.name="${PASEO_MOD_NAME}" \
      org.ovlerfork.paseo.mod.package="${PASEO_MOD_PACKAGE}" \
      org.ovlerfork.paseo.mod.package.version="${PASEO_MOD_PACKAGE_VERSION}"
COPY root-layer/ /
COPY --from=meta /root-layer/ /
