import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CSpellCacheTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-spelling-cache-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        for name in (
            "check-spelling.sh",
            ".gitignore",
            "package.json",
            "bun.lock",
            "bunfig.toml",
        ):
            shutil.copyfile(ROOT / name, self.root / name)
        (self.root / "node_modules").symlink_to(ROOT / "node_modules")
        self.sample = self.root / "sample.txt"
        self.sample.write_text("hello\n")
        self.configure([])

    def configure(self, words):
        (self.root / "cspell.config.jsonc").write_text(json.dumps({
            "version": "0.2",
            "files": ["sample.txt"],
            "useGitignore": True,
            "ignorePaths": [
                "node_modules/**", "*.sh", "*.json", "*.jsonc", "*.toml", "bun.lock",
            ],
            "words": words,
        }))

    def check(self, success=True):
        result = subprocess.run(
            ["bash", "check-spelling.sh"],
            cwd=self.root,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stdout + result.stderr)
        return result.stdout + result.stderr

    def test_content_changes_with_unchanged_metadata_are_checked(self):
        self.check()
        self.assertTrue(list((self.root / ".cache/cspell").iterdir()))
        self.check()
        before = self.sample.stat()
        self.sample.write_text("hell" + "q\n")
        self.assertEqual(self.sample.stat().st_size, before.st_size)
        os.utime(self.sample, ns=(before.st_atime_ns, before.st_mtime_ns))
        for _ in range(2):
            self.assertIn("sample.txt", self.check(success=False))
        self.sample.write_text("hello\n")
        self.check()

    def test_dictionary_and_dependencies_invalidate_results(self):
        word = "spell" + "cache" + "word"
        self.configure([word])
        self.sample.write_text(f"{word}\n")
        self.check()
        cache = self.root / ".cache/cspell"
        before = set(cache.iterdir())
        with (self.root / "bun.lock").open("a") as lockfile:
            lockfile.write("\n")
        self.check()
        self.assertTrue(set(cache.iterdir()) - before)
        self.configure([])
        self.assertIn(word, self.check(success=False))

    def test_cached_spelling_does_not_skip_unused_words(self):
        word = "spell" + "cache" + "word"
        self.configure([word])
        self.sample.write_text(f"{word}\n")
        self.check()
        self.check()
        self.sample.write_text("hello\n")
        for _ in range(2):
            self.assertIn("not being used", self.check(success=False))


if __name__ == "__main__":
    unittest.main()
