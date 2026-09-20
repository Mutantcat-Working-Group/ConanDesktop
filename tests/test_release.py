import importlib.util
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("release", ROOT / "scripts" / "release.py")


class ReleaseTests(unittest.TestCase):
    def test_release_tool_exists(self):
        self.assertTrue(Path(SPEC.origin).is_file(), "Release validation tool must exist")

    def load_tool(self):
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        return module

    def test_windows_version_mapping(self):
        self.assertEqual(self.load_tool().windows_version("1.0.20260920"), "1.0.2026+920")
        self.assertEqual(self.load_tool().windows_version("2.1.20270101"), "2.1.2027+101")

    def test_invalid_versions_are_rejected(self):
        for version in ["1.0.20260230", "v1.0.20260920", "1.0.0", "65536.0.20260920", "1.0.20260920-beta", "01.0.20260920"]:
            with self.subTest(version=version), self.assertRaises(ValueError):
                self.load_tool().windows_version(version)

    def test_current_version_and_tag_match(self):
        tool = self.load_tool()
        version = json.loads((ROOT / "package.json").read_text())["version"]
        self.assertEqual(tool.validate_versions(ROOT, f"v{version}"), version)
        with self.assertRaises(ValueError):
            tool.validate_versions(ROOT, "not-a-version-tag")

    def fixture(self, root):
        for name in ["package.json", "src-tauri/tauri.conf.json", "src-tauri/tauri.windows.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"]:
            destination = root / name
            destination.parent.mkdir(exist_ok=True, parents=True)
            shutil.copy2(ROOT / name, destination)

    def test_collect_and_checksums_require_exactly_four_installers(self):
        tool = self.load_tool()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.fixture(root)
            version = tool.validate_versions(root)
            for platform, (target, folder, extension) in tool.TARGETS.items():
                with self.assertRaises(ValueError):
                    tool.collect(root, platform)
                source = root / "src-tauri/target" / target / "release/bundle" / folder
                source.mkdir(parents=True)
                (source / f"fixture.{extension}").write_bytes(b"installer fixture")
                tool.collect(root, platform)
                self.assertTrue((root / "release-assets" / tool.asset_name(version, platform)).is_file())
            tool.checksums(root)
            lines = (root / "release-assets/SHA256SUMS.txt").read_text().splitlines()
            self.assertEqual(len(lines), 4)
            self.assertTrue(all(line.startswith(hashlib.sha256(b"installer fixture").hexdigest()) for line in lines))
            (root / "release-assets" / tool.asset_name(version, "linux-x64")).unlink()
            with self.assertRaises(ValueError):
                tool.checksums(root)

    def test_duplicate_installers_and_version_drift_are_rejected(self):
        tool = self.load_tool()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.fixture(root)
            source = root / "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis"
            source.mkdir(parents=True)
            for name in ["one.exe", "two.exe"]:
                (source / name).write_bytes(b"fixture")
            with self.assertRaises(ValueError):
                tool.collect(root, "windows-x64")
            (root / "src-tauri/tauri.windows.conf.json").write_text('{"version":"0.1.0"}')
            with self.assertRaises(ValueError):
                tool.validate_versions(root)


if __name__ == "__main__":
    unittest.main()
