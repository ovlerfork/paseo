# Paseo patchset

This repository is maintained as a patch-based fork of `getpaseo/paseo`.

Upstream is treated as read-only. Local changes are stored as replayable patch files in `patches/cur` and applied with `git am --3way`.

## Branches

| Branch | Purpose | Writer |
| --- | --- | --- |
| `patchset` | Patch files, scripts, workflows, and docs. This is the default branch. | Humans |
| `main` | Tracks upstream `main`. | CI / maintainers |
| `patched` | Optional generated branch: upstream plus patches applied. | CI / maintainers |

## Current patch series

The current series carries fork-owned source patches again:

- `0001-fix-docker-restore-sandbox-runtime-tooling.patch` restores the Docker sandbox/runtime/tooling layer in upstream Docker source. It pins the runtime to Node 24.16.0 by default, adds a `RUNTIME_IMAGE` build-arg path for Ubuntu-based variants, adds `PASEO_RUNTIME_USER=paseo|root`, and bakes in `bubblewrap`, GitHub CLI, `uv`, pinned npm/Corepack/pnpm, `ripgrep`, `fd`, `inotifywait`, `pipx`, `rsync`, `openssh-client`, archive helpers, editor/viewer helpers, and Python venv support.
- `0002-fix-docker-add-fish-completions.patch` adds `fish` and `bash-completion` to both Docker runtime build paths and includes build-time checks for `fish --version` and `/usr/share/bash-completion/bash_completion`.
- `0003-fix-docker-add-ssh-runtime.patch` adds an optional Docker SSH runtime. It installs `openssh-server`, keeps SSH disabled by default, starts key-only `sshd` when `PASEO_SSH_ENABLED=true`, reads authorized keys from a Compose-friendly config path, and documents the opt-in Compose config mount.
- `0004-fix-docker-restore-agent-Docker-Mods.patch` restores runtime agent Docker Mods on the current `tini` entrypoint without baking agent CLIs into the base image. It adds the `docker-mods` loader, a `paseo-mod-install` helper that prefers `pnpm` for global Node tools and `uv` for Python tools, `jq`, `busybox-static`, common diagnostics/networking utilities, and mod images for Claude Code, Codex, Copilot, OpenCode, and Pi.
- `0005-fix-docker-add-extended-runtime-tools.patch` adds extended runtime diagnostics and terminal tools including `tmux`, `htop`, `btop`, `strace`, `socat`, `openssl`, `gnupg`, `yq`, `sqlite3`, `sudo`, `net-tools`, `traceroute`, and `tcpdump`.
- `0006-fix-docker-pin-mod-package-versions.patch` lets Docker Mod images carry the resolved npm package name and version in labels and layer metadata. Mod install hooks read that metadata and install the matching package version instead of implicitly floating at install time.

Customized Dockerized Paseo is no longer workflow-only. The `Auto Docker Publish` workflow applies `patches/cur`, updates the generated `patched` branch, and source-builds the fork image with `docker/base/Dockerfile` before publishing to the fork GHCR namespace.

Docker Mods are restored on the current `tini` plus `paseo-docker-entrypoint` runtime. The old s6 overlay runtime remains intentionally absent.

## Apply locally

```bash
git clone https://github.com/getpaseo/paseo.git paseo-source
cd paseo-source
git remote add upstream https://github.com/getpaseo/paseo.git
git fetch upstream main
PATCH_DIR=/path/to/patchset/patches/cur /path/to/patchset/scripts/apply-patches.sh
```

## Refresh patches

From a branch containing upstream plus local patch commits:

```bash
UPSTREAM_REF=upstream/main /path/to/patchset/scripts/refresh-patches.sh
```

To add patches again later, create a branch from the upstream ref, make the local commits there, and run `scripts/refresh-patches.sh` with `UPSTREAM_REF` pointing at the same upstream base. Keep each patch focused on a current fork-only delta.

## Automation

- `Upstream Sync` keeps `main` aligned to upstream `getpaseo/paseo:main`.
- `Patch Check` verifies that the patch series applies cleanly to current upstream.
- `Auto Docker Publish` runs after a successful `Patch Check` on `patchset`, or by manual dispatch. It applies `patches/cur`, drops upstream workflow files from the generated tree so GitHub can accept the branch update, force-updates `patched`, then builds and publishes the source-built default image as `ghcr.io/<fork-owner>/paseo:<version>`, `:<version>-<source-sha>`, and `:latest`.
- The same workflow also publishes the root-runtime Ubuntu sandbox variant as `:<version>-ubuntu-sandbox`, `:<version>-<source-sha>-ubuntu-sandbox`, and `:ubuntu-sandbox`.
- The same workflow runs on an hourly schedule for Docker Mods only. For each mod it resolves the matching npm package version and skips publishing when `ghcr.io/<fork-owner>/mods:<mod>-pkg-<package-version>` already exists.
- `Auto Desktop Build` runs after a successful `Patch Check` on `patchset`, or by manual dispatch. It applies `patches/cur`, drops upstream workflow files from the generated tree so GitHub can accept the branch update, force-updates `patched`, then uploads Linux, Windows, and macOS desktop artifacts.

Both artifact workflows use the same empty-patch-safe `nullglob` array pattern as `Patch Check`, so they still produce a valid `patched` branch and fork-owned build outputs if the patch series is pruned again later.
