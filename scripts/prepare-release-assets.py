#!/usr/bin/env python3
"""Collect release artifacts without changing Electron Builder filenames."""

from __future__ import annotations

import argparse
import pathlib
import shutil
import sys

import yaml


def one_directory(root: pathlib.Path, pattern: str) -> pathlib.Path:
    matches = sorted(root.glob(pattern))
    if len(matches) != 1:
        raise SystemExit(f"Expected one artifact directory for {pattern}, found: {matches}")
    return matches[0]


def copy_files(source: pathlib.Path, destination: pathlib.Path) -> None:
    for item in source.iterdir():
        if not item.is_file():
            continue
        if item.name in {"builder-debug.yml", "builder-effective-config.yaml"}:
            continue
        shutil.copy2(item, destination / item.name)


def metadata_urls(path: pathlib.Path) -> list[str]:
    with path.open() as file:
        document = yaml.safe_load(file)
    return [entry["url"] for entry in document["files"]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--channel", choices=("latest", "beta", "dev"), required=True)
    args = parser.parse_args()

    output = args.output
    output.mkdir()
    artifacts = args.artifacts
    metadata_prefix = args.channel

    windows = one_directory(artifacts, f"release-windows-{args.version}-*")
    linux = one_directory(artifacts, f"release-linux-{args.version}-*")
    macos_arm64 = one_directory(artifacts, f"release-macos-arm64-{args.version}-*")

    copy_files(windows, output)
    copy_files(linux, output)
    copy_files(macos_arm64, output)

    for platform in ("", "-linux", "-mac"):
        metadata = output / f"{metadata_prefix}{platform}.yml"
        missing = [url for url in metadata_urls(metadata) if not (output / url).is_file()]
        if missing:
            raise SystemExit(f"{metadata.name} references missing assets: {', '.join(missing)}")

    windows_urls = metadata_urls(output / f"{metadata_prefix}.yml")
    if not any("-x64.exe" in url for url in windows_urls) or not any("-arm64.exe" in url for url in windows_urls):
        raise SystemExit(f"{metadata_prefix}.yml is missing a Windows architecture")

    shutil.copy2(
        one_directory(artifacts, f"release-ios-{args.version}-*") / f"Paseo-{args.version}-ios-unsigned.ipa",
        output,
    )


if __name__ == "__main__":
    main()
