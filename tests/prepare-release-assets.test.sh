#!/usr/bin/env bash
set -euo pipefail

SCRIPT_FILE="${SCRIPT_FILE:-$(dirname "$0")/../scripts/prepare-release-assets.py}" python3 - <<'PY'
import argparse
import base64
import gzip
import hashlib
import importlib.util
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch

import yaml

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("release_assets", os.environ["SCRIPT_FILE"])
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


def digest(data):
    return base64.b64encode(hashlib.sha512(data).digest()).decode()


with tempfile.TemporaryDirectory() as temporary:
    root = pathlib.Path(temporary)
    remote = root / "remote"
    remote.mkdir()
    generated = root / "generated"
    generated.mkdir()
    version = "0.13.0"
    channel = "dev"
    tag = "v0.13-dev.source-abc123"
    release_exists = False
    release_draft = False
    race_create = True

    def release_info(_tag, _repo):
        return ({file.name for file in remote.iterdir()}, release_draft) if release_exists else None

    def gh(*args, check=True):
        global release_exists, release_draft, race_create
        command = args[:2]
        if command == ("release", "create"):
            release_exists = True
            if race_create:
                race_create = False
                return subprocess.CompletedProcess(args, 1, "", "another platform created the release")
        elif command == ("release", "edit"):
            release_draft = False
        elif command == ("release", "upload"):
            shutil.copy2(args[3], remote / pathlib.Path(args[3]).name)
        elif command == ("release", "download"):
            name = args[args.index("--pattern") + 1]
            shutil.copy2(remote / name, pathlib.Path(args[args.index("--dir") + 1]) / name)
        else:
            raise AssertionError(args)
        return subprocess.CompletedProcess(args, 0, "", "")

    common = dict(tag=tag, repo="example/paseo", version=version, channel=channel,
                  mode="dev", upstream_sha="upstream", source_sha="abc123",
                  owner="example", clients_only=False)
    linux_names = assets.REQUIRED_ASSETS["linux"](version, channel)
    for name in linux_names[:-1]:
        (generated / name).write_bytes(name.encode())
    (generated / linux_names[-1]).write_text("files:\n  - url: Paseo-x86_64.AppImage\n")

    def regenerate_blockmap(binary, blockmap):
        blockmap.write_bytes(gzip.compress(b"map of " + binary.read_bytes()))

    with patch.object(assets, "release_info", release_info), patch.object(assets, "gh", gh), \
            patch.object(assets, "regenerate_blockmap", regenerate_blockmap):
        assets.publish(argparse.Namespace(**common, platform="linux", artifacts=generated))
        assert {file.name for file in remote.iterdir()} == set(linux_names)
        metadata = yaml.safe_load((remote / f"{channel}-linux.yml").read_text())
        assert metadata["files"][0]["sha512"] == digest(b"Paseo-x86_64.AppImage")
        assert "GHCR: ghcr.io/example/paseo:dev-upstream-source-abc123" in assets.release_notes(argparse.Namespace(**common))
        output = root / "outputs"
        assets.status(argparse.Namespace(**common, output=output))
        lines = output.read_text().splitlines()
        assert "linux_needed=false" in lines
        assert "windows_needed=true" in lines and "macos_needed=true" in lines and "ios_needed=true" in lines
        assert "draft_ready=false" in lines
        release_draft = True
        assets.status(argparse.Namespace(**common, output=output))
        assert "draft_ready=true" in output.read_text().splitlines()

        # A partial retry uses the published installer and blockmap, while
        # adding the missing architecture and a feed matching both binaries.
        windows = root / "windows"
        windows.mkdir()
        windows_names = assets.REQUIRED_ASSETS["windows"](version, channel)
        old_exe = windows_names[0]
        old_blockmap = old_exe + ".blockmap"
        (remote / old_exe).write_bytes(b"published x64")
        (remote / old_blockmap).write_bytes(gzip.compress(b"map of published x64"))
        for name in windows_names[:-1]:
            (windows / name).write_bytes(("rebuilt " + name).encode())
        for name in windows_names:
            if name.endswith(".blockmap"):
                binary = windows / name.removesuffix(".blockmap")
                (windows / name).write_bytes(gzip.compress(b"map of " + binary.read_bytes()))
        (windows / windows_names[-1]).write_text(
            f"files:\n  - url: {windows_names[0]}\n  - url: {windows_names[2]}\n"
        )
        assets.publish(argparse.Namespace(**common, platform="windows", artifacts=windows))
        assert not release_draft
        assert (remote / old_exe).read_bytes() == b"published x64"
        assert gzip.decompress((remote / old_blockmap).read_bytes()) == b"map of published x64"
        metadata = yaml.safe_load((remote / f"{channel}.yml").read_text())
        assert metadata["files"][0]["sha512"] == digest(b"published x64")
        assert metadata["files"][1]["sha512"] == digest(("rebuilt " + windows_names[2]).encode())
        combined_exe = f"Paseo-Setup-{version}.exe"
        assert (remote / combined_exe).is_file()
        assert (remote / f"{combined_exe}.blockmap").is_file()
        assets.status(argparse.Namespace(**common, output=output))
        assert "windows_needed=false" in output.read_text().splitlines()
        (remote / f"{combined_exe}.blockmap").unlink()
        incomplete_output = root / "incomplete-outputs"
        assets.status(argparse.Namespace(**common, output=incomplete_output))
        assert "windows_needed=true" in incomplete_output.read_text().splitlines()
        assets.publish(argparse.Namespace(**common, platform="windows", artifacts=windows))
        assert (remote / f"{combined_exe}.blockmap").is_file()

        # An existing feed cannot be paired with a different rebuilt installer.
        arm_exe = windows_names[2]
        (remote / arm_exe).unlink()
        (windows / arm_exe).write_bytes(b"different arm64")
        try:
            assets.publish(argparse.Namespace(**common, platform="windows", artifacts=windows))
        except ValueError:
            pass
        else:
            raise AssertionError("existing updater metadata accepted a different installer")
        assert not (remote / arm_exe).exists()
        (windows / arm_exe).write_bytes(("rebuilt " + arm_exe).encode())
        assets.publish(argparse.Namespace(**common, platform="windows", artifacts=windows))
        assert (remote / arm_exe).is_file()

        # A missing sidecar is regenerated from the effective published binary.
        (remote / old_blockmap).unlink()
        (remote / windows_names[-1]).unlink()
        assets.publish(argparse.Namespace(**common, platform="windows", artifacts=windows))
        assert gzip.decompress((remote / old_blockmap).read_bytes()) == b"map of published x64"

        # A retained blockmap cannot be paired with a newly rebuilt binary.
        (remote / arm_exe).unlink()
        (windows / arm_exe).write_bytes(b"different arm64")
        try:
            assets.publish(argparse.Namespace(**common, platform="windows", artifacts=windows))
        except ValueError as error:
            assert "blockmap" in str(error)
        else:
            raise AssertionError("existing blockmap accepted a different installer")
        assert not (remote / arm_exe).exists()
        (windows / arm_exe).write_bytes(("rebuilt " + arm_exe).encode())
        assets.publish(argparse.Namespace(**common, platform="windows", artifacts=windows))
        assert (remote / arm_exe).is_file()

        macos = root / "macos"
        macos.mkdir()
        macos_names = assets.REQUIRED_ASSETS["macos"](version, channel)
        for name in macos_names[:-1]:
            (macos / name).write_bytes(name.encode())
        (macos / macos_names[-1]).write_text(
            f"files:\n  - url: {macos_names[2]}\npath: {macos_names[2]}\nsha512: old\n"
        )
        assets.publish(argparse.Namespace(**common, platform="macos", artifacts=macos))
        metadata = yaml.safe_load((remote / f"{channel}-mac.yml").read_text())
        assert metadata["sha512"] == metadata["files"][0]["sha512"]
        assert metadata["sha512"] == digest(macos_names[2].encode())

        # The iOS publisher reads from the source root, which also contains
        # repository files that must never become release assets.
        source = root / "source"
        source.mkdir()
        ipa_name = assets.REQUIRED_ASSETS["ios"](version, channel)[0]
        (source / ipa_name).write_bytes(b"unsigned ipa")
        (source / "package.json").write_text('{"version":"0.13.0"}\n')
        (source / "README.md").write_text("source tree\n")
        before_ios = {file.name for file in remote.iterdir()}
        assets.publish(argparse.Namespace(**common, platform="ios", artifacts=source))
        assert {file.name for file in remote.iterdir()} - before_ios == {ipa_name}
        assert (remote / ipa_name).read_bytes() == b"unsigned ipa"

        # A completed platform is not published again on a rerun.
        before = {file.name: file.read_bytes() for file in remote.iterdir()}
        assets.publish(argparse.Namespace(**common, platform="linux", artifacts=generated))
        assert before == {file.name: file.read_bytes() for file in remote.iterdir()}

print("incremental client asset publication test passed")
PY
