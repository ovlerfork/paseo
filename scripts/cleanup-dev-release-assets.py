#!/usr/bin/env python3
"""Back up and remove the verified source files from one legacy fork release."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess


REPOSITORY = "ovlerfork/paseo"
TAG = "v0.13.0-dev.source-52f00c789"
BRANCH = "chore/cleanup-dev-release-assets"
INVENTORY_PATH = Path(__file__).resolve().parent / "cleanup-dev-release-assets.json"


def gh(*args):
    return subprocess.run(["gh", *args], check=True, text=True, capture_output=True).stdout


def live_assets(release_id):
    endpoint = f"repos/{REPOSITORY}/releases/{release_id}/assets?per_page=100"
    assets = json.loads(gh("api", endpoint))
    if len(assets) >= 100:
        raise ValueError("Release asset listing may be incomplete")
    return assets


def identity(asset):
    return {key: asset[key] for key in ("id", "name", "size", "digest")}


def validate_release(inventory):
    if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY:
        raise ValueError(f"Cleanup is restricted to {REPOSITORY}")
    release_record = inventory["release"]
    if inventory["source"]["repository"] != REPOSITORY or release_record["tag"] != TAG:
        raise ValueError("Inventory targets another release")

    release = json.loads(gh("api", f"repos/{REPOSITORY}/releases/tags/{TAG}"))
    if (release["id"] != release_record["id"] or release["tag_name"] != TAG
            or release["draft"] != release_record["draft"]
            or release["prerelease"] != release_record["prerelease"]):
        raise ValueError("Release identity changed")
    tag_commit = json.loads(gh("api", f"repos/{REPOSITORY}/commits/{TAG}"))["sha"]
    if tag_commit != inventory["source"]["tag_commit"]:
        raise ValueError("Release source tag changed")

    expected_assets = inventory["inventory"]["intended_assets"]
    accidental_assets = inventory["inventory"]["accidental_assets"]
    expected = {asset["id"]: identity(asset) for asset in expected_assets}
    accidental = {asset["id"]: identity(asset) for asset in accidental_assets}
    if len(expected) != 20 or len(accidental) != 28 or set(expected) & set(accidental):
        raise ValueError("Inventory must identify 20 intended and 28 accidental assets")
    if len({asset["name"] for asset in expected_assets + accidental_assets}) != 48:
        raise ValueError("Inventory contains duplicate asset names")

    assets = live_assets(release["id"])
    current = {asset["id"]: identity(asset) for asset in assets}
    if len(current) != len(assets):
        raise ValueError("Release has duplicate asset IDs")
    if set(current) - set(expected) - set(accidental):
        raise ValueError("Release contains an unlisted asset")
    for asset_id, asset in expected.items():
        if current.get(asset_id) != asset:
            raise ValueError(f"Intended asset {asset['name']} is missing or changed")
    for asset_id, asset in accidental.items():
        if asset_id in current and current[asset_id] != asset:
            raise ValueError(f"Accidental asset {asset['name']} changed")
    return [asset for asset_id, asset in accidental.items() if asset_id in current]


def backup_assets(backup_dir, accidental):
    backup_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(INVENTORY_PATH, backup_dir / INVENTORY_PATH.name)
    for asset in accidental:
        gh("release", "download", TAG, "--repo", REPOSITORY,
           "--pattern", asset["name"], "--dir", str(backup_dir))
        downloaded = backup_dir / asset["name"]
        if not downloaded.is_file() or downloaded.stat().st_size != asset["size"]:
            raise ValueError(f"Backup size mismatch for {asset['name']}")
        digest = "sha256:" + hashlib.sha256(downloaded.read_bytes()).hexdigest()
        if digest != asset["digest"]:
            raise ValueError(f"Backup digest mismatch for {asset['name']}")
    print(f"Backed up {len(accidental)} remaining accidental assets")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("prepare", "delete"))
    parser.add_argument("--backup-dir", type=Path)
    args = parser.parse_args()
    inventory = json.loads(INVENTORY_PATH.read_text())
    accidental = validate_release(inventory)
    if args.action == "prepare":
        if args.backup_dir is None:
            parser.error("prepare requires --backup-dir")
        backup_assets(args.backup_dir, accidental)
    else:
        if (os.environ.get("GITHUB_ACTIONS") != "true"
                or os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
                or os.environ.get("GITHUB_REF_NAME") != BRANCH):
            raise ValueError("Deletion is restricted to the cleanup branch workflow dispatch")
        for asset in accidental:
            gh("api", "--method", "DELETE",
               f"repos/{REPOSITORY}/releases/assets/{asset['id']}")
            print(f"Removed {asset['name']} ({asset['id']})")
        if validate_release(inventory):
            raise ValueError("Some accidental assets remain")
        print("All intended release assets remain unchanged")


if __name__ == "__main__":
    main()
