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
- `0007-fix-docker-set-Codex-agent-thread-cap.patch` makes the Codex Docker Mod ensure the runtime user's `config.toml` has `[agents] max_threads = 64` before the daemon launches Codex app-server sessions.
- `0008-fix-docker-add-oh-my-pi-omp-Docker-mod.patch` adds an `omp` Docker Mod for Oh My Pi. Because omp ships as a Bun bundle, the hook installs the Bun runtime with `pnpm add -g --allow-build=bun bun` before installing the version-pinned `@oh-my-pi/pi-coding-agent` package.
- `0009-fix-docker-add-ACP-provider-catalog-mods.patch` adds Docker Mods for the npm-installable ACP catalog agents: `amp-acp` (with the `@ampcode/cli` runtime), `codebuddy`, `codewhale`, `junie`, `kilo`, and `kimi`. Packages whose postinstall promotes a platform binary install with `pnpm --allow-build`. Other ACP catalog entries launch through `npx` or `uvx` and need no mod.
- `0010-fix-docker-add-devspace-Docker-mod.patch` adds a `devspace` Docker Mod for the `@waishnav/devspace` MCP server. The hook installs the version-pinned package with `pnpm`, allows the `better-sqlite3` binding build, and creates the runtime user's `~/.devspace` state directory so settings and auth persist with the home volume.
- `0011-fix-docker-run-mod-start-hooks.patch` runs optional `/etc/paseo-mods/<name>/start` hooks from the entrypoint in the background on every container start as the runtime user. The first consumer is the `devspace` mod, which starts `devspace serve` when `~/.devspace/auth.json` or `DEVSPACE_OAUTH_OWNER_TOKEN` is present and honors `DEVSPACE_ENABLED=false`.
- `0012-fix-docker-expose-mod-binaries-to-SSH-shells.patch` adds `/etc/profile.d/paseo-path.sh` and sources it from `/etc/bash.bashrc` so the pnpm mod prefix (`/usr/local/share/pnpm/bin`) is on `PATH` in SSH login and interactive shells, where sshd otherwise supplies its own default `PATH`.
- `0013-fix-desktop-use-fork-github-releases.patch` configures the desktop updater to read releases from the `ovlerfork/paseo` fork.
- `0014-feat-sidebar-project-groups.patch` adds named project groups to the sidebar, with shared membership persistence and daemon protocol support.
- `0016-fix-docker-add-agy-acp-Docker-mod.patch` adds an `agy-acp` Docker Mod for the version-pinned `paseo-agy-acp` Antigravity ACP adapter, allows its `better-sqlite3` native build, and documents runtime-user login, home persistence, and explicit provider setup.
- `0018-fix-about-label-release-and-dev-channels.patch` labels About update channels as Release and Dev across all locales using the existing stable/beta update settings. Release follows upstream stable releases; Dev follows upstream Beta prereleases.

Customized Dockerized Paseo is no longer workflow-only. The `Fork Release Build` workflow applies `patches/cur`, updates the generated `patched` branch, and source-builds the fork image with `docker/base/Dockerfile` before publishing to the fork GHCR namespace.

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
- `Patch Check` verifies that the patch series applies cleanly to current upstream, runs the patchset metadata sanitizer, validates the patchset shell scripts, and runs the development publish-policy tests.
- `Fork Release Build` runs after a successful `Patch Check` on `patchset`, by manual dispatch, or on scheduled runs. The five-minute Docker schedule retains its existing source and mod publishing policy and does not build or publish clients. Separate hourly client-only schedules track upstream stable releases and Beta prereleases, skip Docker jobs, and retain the generated `patched` branch. Each schedule has its own concurrency lane. Manual dispatch can use `clients_only` with release or prerelease mode for the same client-only build path. It applies `patches/cur`, records the abbreviated post-patch source SHA, then sanitizes upstream-generated source by dropping upstream workflow files before updating `patched` for Docker runs. For release publishing, it builds server images and Windows, Apple Silicon macOS, Linux, and unsigned iOS client artifacts from that same patched source and publishes them in a fork GitHub Release. Desktop builds explicitly generate updater metadata for the resolved latest, beta, or dev channel. Main development builds publish dev metadata under `v<base-version>-dev.source-<source-sha>` tags, separate from upstream Beta client releases. Development and prerelease releases are marked prerelease; formal releases are published as regular GitHub Releases. iOS artifacts are unsigned IPAs for self-signing. Scheduled runs publish source images only when the fork GHCR namespace is missing the current patched upstream version tag.
- The same workflow also publishes the root-runtime Ubuntu sandbox variant as `:<version>-ubuntu-sandbox`, `:<version>-<source-sha>-ubuntu-sandbox`, and `:ubuntu-sandbox`.
- When `Upstream Sync` detects a new upstream commit, it passes that full SHA and an explicit development-publish input to `Patch Check`. Patch Check records its checked-out patchset SHA. After patch application, metadata sanitization, shell validation, and publish-policy tests succeed, it dispatches development publishing directly with both pinned SHAs. Fork Release Build sanitizes generated source later, before building. Development source image tags are `:dev`, `:dev-<full-upstream-sha>`, and the immutable `:dev-<full-upstream-sha>-source-<source-sha>` alias for the default variant, plus `:dev-ubuntu-sandbox`, `:dev-<full-upstream-sha>-ubuntu-sandbox`, and `:dev-<full-upstream-sha>-source-<source-sha>-ubuntu-sandbox` for the Ubuntu sandbox variant. The workflow skips the source-image build only when both immutable development tags already exist.
- The same workflow checks Docker Mods on the same schedule. For each mod it resolves the matching npm package version and skips publishing when `ghcr.io/<fork-owner>/mods:<mod>-pkg-<package-version>` already exists.

The artifact workflow uses the same empty-patch-safe `nullglob` array pattern as `Patch Check`, so it still produces a valid `patched` branch and fork-owned build outputs if the patch series is pruned again later.
