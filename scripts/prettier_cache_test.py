import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PrettierCacheTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-prettier-cache-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        for pattern in (
            "check-formatting.sh",
            ".gitignore",
            ".prettierignore",
            "prettier.config.mjs",
            "package.json",
            "bun.lock",
            "bunfig.toml",
            "tsconfig*.json",
            "packages/*/tsconfig*.json",
            "misc/*/tsconfig*.json",
        ):
            for source in ROOT.glob(pattern):
                target = self.root / source.relative_to(ROOT)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
        (self.root / "node_modules").symlink_to(ROOT / "node_modules")
        self.sample = self.root / "sample.js"
        self.sample.write_text("const value = 1;\n")

    def check(self, success=True):
        result = subprocess.run(
            ["bash", "check-formatting.sh"],
            cwd=self.root,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stdout + result.stderr)
        return result.stdout + result.stderr

    def test_content_changes_with_unchanged_metadata_are_checked(self):
        self.check()
        self.assertTrue(list((self.root / ".cache/prettier").iterdir()))
        self.check()
        before = self.sample.stat()
        self.sample.write_text("const value=  1;\n")
        self.assertEqual(self.sample.stat().st_size, before.st_size)
        os.utime(self.sample, ns=(before.st_atime_ns, before.st_mtime_ns))
        for _ in range(2):
            self.assertIn("sample.js", self.check(success=False))
        self.sample.write_text("const value = 1;\n")
        self.check()

    def test_configuration_and_dependencies_invalidate_results(self):
        self.check()
        cache = self.root / ".cache/prettier"
        before = set(cache.iterdir())
        with (self.root / "bun.lock").open("a") as lockfile:
            lockfile.write("\n")
        self.check()
        self.assertTrue(set(cache.iterdir()) - before)
        (self.root / "prettier.config.mjs").write_text(
            "export default { semi: false }\n"
        )
        self.assertIn("sample.js", self.check(success=False))


if __name__ == "__main__":
    unittest.main()
