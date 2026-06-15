# Paseo patchset

This repository is maintained as a patch-based fork of `getpaseo/paseo`.

Upstream is treated as read-only. Local changes are stored as replayable patch files in `patches/cur` and applied with `git am --3way`.

## Branches

| Branch | Purpose | Writer |
| --- | --- | --- |
| `patchset` | Patch files, scripts, workflows, and docs. This is the default branch. | Humans |
| `main` | Tracks upstream `main`. | CI / maintainers |
| `patched` | Generated branch: upstream plus patches applied. | CI only |

## Current patch series

The current series imports Docker support and Docker publishing/build automation for the Paseo daemon and agent Docker Mods. It also installs `bubblewrap` in the base Docker images and publishes an `ubuntu-sandbox` image variant for agents that need nested Linux sandboxing inside Paseo containers. The sandbox variant bakes in common agent tools such as `gh`, `uv`, `pnpm`, `ripgrep`, `fd`, `pipx`, `rsync`, and archive/SSH utilities so they are available immediately after reboot.

It also carries a desktop attachment fix so generic file uploads keep dotted extensions when copied through Electron-managed storage. This lets archive files such as `.zip` pass the existing desktop IPC extension validation and continue through the normal file upload path.

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

## Automation

- `Upstream Sync` keeps `main` aligned to upstream `getpaseo/paseo:main`.
- `Patch Check` verifies that the patch series applies cleanly to current upstream.
- `Auto Docker Publish` updates the generated `patched` branch and publishes Docker images to GHCR when the patch check succeeds.
- `Auto Desktop Build` updates the generated `patched` branch and uploads Linux, Windows, and unsigned/unnotarized macOS desktop artifacts to the workflow run when the patch check succeeds. It can also be run manually for a single platform.
