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

The current series carries no source patches. Applying the patchset to upstream is expected to be a no-op.

Customized Dockerized Paseo is currently rebuilt by fork-owned automation rather than source patches. The `Auto Docker Publish` workflow applies the current patchset to upstream, updates the generated `patched` branch, and source-builds the fork image with `docker/base/Dockerfile.source` before publishing to the fork GHCR namespace.

The previous Docker Mods, sandbox image, and desktop attachment patches were not restored because current upstream already carries the Docker runtime and source-build foundation, and no current source-level customization is justified for those areas.

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
- `Auto Docker Publish` runs after a successful `Patch Check` on `patchset`, or by manual dispatch. It applies `patches/cur`, drops upstream workflow files from the generated tree so GitHub can accept the branch update, force-updates `patched`, then builds and publishes the source-built image as `ghcr.io/<fork-owner>/paseo`.
- `Auto Desktop Build` runs after a successful `Patch Check` on `patchset`, or by manual dispatch. It applies `patches/cur`, drops upstream workflow files from the generated tree so GitHub can accept the branch update, force-updates `patched`, then uploads Linux, Windows, and macOS desktop artifacts.

Both artifact workflows use the same empty-patch-safe `nullglob` array pattern as `Patch Check`, so the current zero-patch series still produces a valid `patched` branch and fork-owned build outputs.
