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

The previous Docker, Docker Mods, sandbox image, and desktop attachment patches were removed after upstream added official Docker support and fixed desktop file upload extension handling.

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

No workflow currently regenerates `patched` or publishes artifacts because the active patch series is empty.
