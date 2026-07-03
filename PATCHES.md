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

Customized Dockerized Paseo is no longer workflow-only. The `Auto Docker Publish` workflow applies `patches/cur`, updates the generated `patched` branch, and source-builds the fork image with `docker/base/Dockerfile.source` before publishing to the fork GHCR namespace.

The previous Docker Mods and s6 overlay patches are not restored. Current upstream has a simpler `tini` plus `paseo-docker-entrypoint` runtime, and the sandbox/tooling requirement is covered by patching that current runtime directly.

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
- `Auto Desktop Build` runs after a successful `Patch Check` on `patchset`, or by manual dispatch. It applies `patches/cur`, drops upstream workflow files from the generated tree so GitHub can accept the branch update, force-updates `patched`, then uploads Linux, Windows, and macOS desktop artifacts.

Both artifact workflows use the same empty-patch-safe `nullglob` array pattern as `Patch Check`, so they still produce a valid `patched` branch and fork-owned build outputs if the patch series is pruned again later.
