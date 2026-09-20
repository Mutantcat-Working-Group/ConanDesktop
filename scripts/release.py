"""Release version validation and deterministic asset collection (Python 3.11+)."""

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import tomllib

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {
    "windows-x64": ("x86_64-pc-windows-msvc", "nsis", "exe"),
    "macos-arm64": ("aarch64-apple-darwin", "dmg", "dmg"),
    "macos-x64": ("x86_64-apple-darwin", "dmg", "dmg"),
    "linux-x64": ("x86_64-unknown-linux-gnu", "appimage", "AppImage"),
}


def windows_version(version):
    match = re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(\d{8})", version)
    if not match:
        raise ValueError("Version must be MAJOR.MINOR.YYYYMMDD")
    major, minor, date = match.groups()
    if int(major) > 65535 or int(minor) > 65535:
        raise ValueError("Windows version components must fit in 16 bits")
    datetime.strptime(date, "%Y%m%d")
    return f"{major}.{minor}.{int(date[:4])}+{int(date[4:])}"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate_versions(root, tag=None):
    version = read_json(root / "package.json")["version"]
    mapped = windows_version(version)
    config = read_json(root / "src-tauri/tauri.conf.json")
    cargo = tomllib.loads((root / "src-tauri/Cargo.toml").read_text(encoding="utf-8"))
    lock = tomllib.loads((root / "src-tauri/Cargo.lock").read_text(encoding="utf-8"))
    locked = next(item for item in lock["package"] if item["name"] == cargo["package"]["name"])
    if any(value != version for value in [config["version"], cargo["package"]["version"], locked["version"]]):
        raise ValueError("package.json, Tauri, Cargo.toml and Cargo.lock versions differ")
    if read_json(root / "src-tauri/tauri.windows.conf.json")["version"] != mapped:
        raise ValueError(f"Windows packaging version must be {mapped}")
    date = datetime.strptime(version.rsplit(".", 1)[1], "%Y%m%d")
    if config["bundle"]["macOS"]["bundleVersion"] != f"{date.year}.{date.month}.{date.day}":
        raise ValueError("macOS bundleVersion must be YYYY.M.D")
    if tag is not None and tag != f"v{version}":
        raise ValueError(f"Tag must be v{version}, got {tag}")
    return version


def asset_name(version, platform):
    extension = TARGETS[platform][2]
    suffix = "-setup" if extension == "exe" else ""
    return f"ConanDesktop_{version}_{platform}{suffix}.{extension}"


def collect(root, platform):
    version = validate_versions(root)
    target, folder, extension = TARGETS[platform]
    source_dir = root / "src-tauri/target" / target / "release/bundle" / folder
    sources = list(source_dir.glob(f"*.{extension}"))
    if len(sources) != 1 or sources[0].stat().st_size == 0:
        raise ValueError(f"Expected exactly one nonempty installer in {source_dir}")
    destination = root / "release-assets"
    destination.mkdir(exist_ok=True)
    output = destination / asset_name(version, platform)
    shutil.copy2(sources[0], output)
    print(output)


def checksums(root):
    version = validate_versions(root)
    directory = root / "release-assets"
    expected = {asset_name(version, platform) for platform in TARGETS}
    actual = {file.name for file in directory.iterdir() if file.name != "SHA256SUMS.txt"}
    if actual != expected:
        raise ValueError(f"Incomplete or unexpected release assets: {actual ^ expected}")
    lines = []
    for name in sorted(expected):
        path = directory / name
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"Empty or invalid artifact: {name}")
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        lines.append(f"{digest}  {name}\n")
    (directory / "SHA256SUMS.txt").write_text("".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "collect", "checksums"])
    parser.add_argument("--tag")
    parser.add_argument("--platform", choices=TARGETS)
    args = parser.parse_args()
    if args.command == "validate":
        print(validate_versions(ROOT, args.tag))
    elif args.command == "collect":
        if not args.platform:
            parser.error("collect requires --platform")
        collect(ROOT, args.platform)
    else:
        checksums(ROOT)


if __name__ == "__main__":
    main()
