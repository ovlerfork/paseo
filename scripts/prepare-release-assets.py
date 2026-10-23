#!/usr/bin/env python3
"""Publish each platform's client assets on the source-tagged GitHub Release."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile


REQUIRED_ASSETS = {
    "windows": lambda version, channel: [
        f"Paseo-Setup-{version}-{arch}.{extension}"
        for arch in ("x64", "arm64")
        for extension in ("exe", "zip")
    ] + [
        f"Paseo-Setup-{version}-{arch}.exe.blockmap" for arch in ("x64", "arm64")
    ] + [f"{channel}.yml"],
    "linux": lambda version, channel: [
        "Paseo-x86_64.AppImage",
        f"Paseo-{version}-amd64.deb",
        f"Paseo-{version}-x86_64.rpm",
        f"Paseo-{version}-x64.tar.gz",
        f"{channel}-linux.yml",
    ],
    "macos": lambda version, channel: [
        f"Paseo-{version}-arm64.dmg",
        f"Paseo-{version}-arm64.dmg.blockmap",
        f"Paseo-{version}-arm64.zip",
        f"Paseo-{version}-arm64.zip.blockmap",
        f"{channel}-mac.yml",
    ],
    "ios": lambda version, channel: [f"Paseo-{version}-ios-unsigned.ipa"],
}
METADATA_SUFFIX = {"windows": "", "linux": "-linux", "macos": "-mac"}


def gh(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(["gh", *args], text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr or f"gh {' '.join(args)} failed")
    return result


def release_assets(tag: str, repo: str) -> set[str] | None:
    result = gh("release", "view", tag, "--repo", repo, "--json", "assets", check=False)
    if result.returncode:
        # A failed lookup can also mean an API error. Do not rebuild or create over it.
        api_error = gh("api", f"repos/{repo}/releases/tags/{tag}", check=False)
        if api_error.returncode == 0:
            raise RuntimeError(result.stderr)
        if "404" not in api_error.stderr:
            raise RuntimeError(api_error.stderr or result.stderr)
        return None
    return {item["name"] for item in json.loads(result.stdout)["assets"]}


def status(args: argparse.Namespace) -> None:
    existing = release_assets(args.tag, args.repo) or set()
    with open(args.output, "a") as output:
        for platform, required in REQUIRED_ASSETS.items():
            needed = not set(required(args.version, args.channel)).issubset(existing)
            print(f"{platform}_needed={str(needed).lower()}", file=output)
            print(f"{platform} release assets needed: {needed}")


def collect_files(source: pathlib.Path, output: pathlib.Path) -> None:
    for item in source.iterdir():
        if item.is_file() and item.name not in {"builder-debug.yml", "builder-effective-config.yaml"}:
            shutil.copy2(item, output / item.name)


def file_sha512(path: pathlib.Path) -> str:
    digest = hashlib.sha512()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return base64.b64encode(digest.digest()).decode()


def regenerate_blockmap(binary: pathlib.Path, blockmap: pathlib.Path) -> None:
    builder = subprocess.run(
        ["node", "-p", "require('app-builder-bin').appBuilderPath"],
        text=True, capture_output=True, check=True,
    ).stdout.strip()
    subprocess.run([builder, "blockmap", "--input", str(binary), "--output", str(blockmap)], check=True)


def validate_metadata(path: pathlib.Path, assets: pathlib.Path, existing: bool) -> None:
    import yaml

    with path.open() as stream:
        document = yaml.safe_load(stream)
    files = document["files"]
    if not files:
        raise ValueError(f"{path.name} contains no files")
    for entry in files:
        name = entry["url"]
        binary = assets / name
        if not binary.is_file():
            raise ValueError(f"{path.name} references missing asset {name}")
        if existing:
            if entry.get("sha512") != file_sha512(binary):
                raise ValueError(f"Existing {path.name} does not match {name}")
        else:
            entry["sha512"] = file_sha512(binary)
            entry["size"] = binary.stat().st_size
    if path.name.endswith(".yml") and "-mac" not in path.name and "-linux" not in path.name:
        urls = [entry["url"] for entry in files]
        if not any("-x64.exe" in name for name in urls) or not any("-arm64.exe" in name for name in urls):
            raise ValueError(f"{path.name} is missing a Windows architecture")
    if existing:
        return
    if "path" in document:
        primary = next((entry for entry in files if entry["url"] == document["path"]), None)
        if primary is None:
            raise ValueError(f"{path.name} primary path is missing")
        document["sha512"] = primary["sha512"]
    with path.open("w") as stream:
        yaml.safe_dump(document, stream, sort_keys=False)


def release_notes(args: argparse.Namespace) -> str:
    notes = f"Built from upstream {args.upstream_sha} with patch source {args.source_sha}."
    if not args.clients_only:
        image_tag = f"{args.version}-{args.source_sha}"
        if args.mode == "dev":
            image_tag = f"dev-{args.upstream_sha}-source-{args.source_sha}"
        notes += f"\n\nGHCR: ghcr.io/{args.owner}/paseo:{image_tag}"
    return notes


def publish(args: argparse.Namespace) -> None:
    with tempfile.TemporaryDirectory() as temporary:
        staged = pathlib.Path(temporary)
        collect_files(args.artifacts, staged)
        required = set(REQUIRED_ASSETS[args.platform](args.version, args.channel))
        missing = required - {file.name for file in staged.iterdir()}
        if missing:
            raise ValueError(f"Missing {args.platform} build assets: {', '.join(sorted(missing))}")

        existing = release_assets(args.tag, args.repo) or set()
        if required.issubset(existing):
            print(f"{args.platform} assets already published")
            return

        # A partial retry keeps published bytes, so its updater feed is based on
        # the binaries that users can actually download from this release.
        rebuilt_hashes = {
            file.name: file_sha512(file)
            for file in staged.iterdir()
            if f"{file.name}.blockmap" in required and file.name in existing
            and f"{file.name}.blockmap" not in existing
        }
        for name in existing & {file.name for file in staged.iterdir()}:
            gh("release", "download", args.tag, "--repo", args.repo, "--pattern", name, "--dir", str(staged), "--clobber")

        for name, rebuilt_hash in rebuilt_hashes.items():
            binary = staged / name
            if rebuilt_hash != file_sha512(binary):
                regenerate_blockmap(binary, staged / f"{name}.blockmap")

        if args.platform in METADATA_SUFFIX:
            metadata_name = f"{args.channel}{METADATA_SUFFIX[args.platform]}.yml"
            validate_metadata(staged / metadata_name, staged, metadata_name in existing)

        if not existing and release_assets(args.tag, args.repo) is None:
            command = ["release", "create", args.tag, "--repo", args.repo, "--verify-tag",
                       "--title", f"Paseo {args.version}", "--notes", release_notes(args)]
            if args.mode != "release":
                command.append("--prerelease")
            result = gh(*command, check=False)
            if result.returncode and release_assets(args.tag, args.repo) is None:
                raise RuntimeError(result.stderr)

        # Another platform may have created the release while this one staged files.
        existing = release_assets(args.tag, args.repo) or set()
        for file in sorted(staged.iterdir(), key=lambda item: (item.suffix == ".yml", item.name)):
            if file.name not in existing:
                gh("release", "upload", args.tag, str(file), "--repo", args.repo)
                print(f"Published {file.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    status_parser = commands.add_parser("status")
    publish_parser = commands.add_parser("publish")
    for command in (status_parser, publish_parser):
        command.add_argument("--tag", required=True)
        command.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY"))
        command.add_argument("--version", required=True)
        command.add_argument("--channel", choices=("latest", "beta", "dev"), required=True)
    status_parser.add_argument("--output", type=pathlib.Path, required=True)
    publish_parser.add_argument("--platform", choices=REQUIRED_ASSETS, required=True)
    publish_parser.add_argument("--artifacts", type=pathlib.Path, required=True)
    publish_parser.add_argument("--mode", choices=("release", "prerelease", "dev"), required=True)
    publish_parser.add_argument("--upstream-sha", required=True)
    publish_parser.add_argument("--source-sha", required=True)
    publish_parser.add_argument("--owner", required=True)
    publish_parser.add_argument("--clients-only", action="store_true")
    args = parser.parse_args()
    if not args.repo:
        parser.error("--repo or GITHUB_REPOSITORY is required")
    if args.command == "status":
        status(args)
    else:
        publish(args)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
