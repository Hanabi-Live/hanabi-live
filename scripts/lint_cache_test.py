import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LintCacheTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-lint-cache-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        for pattern in (
            ".gitignore",
            "turbo.json",
            "package.json",
            "bun.lock",
            "bunfig.toml",
            "eslint.config.mjs",
            "tsconfig*.json",
            "patches/*",
            "packages/*/package.json",
        ):
            for source in ROOT.glob(pattern):
                target = self.root / source.relative_to(ROOT)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
        self.packages = {
            path.parent.name
            for path in self.root.glob("packages/*/package.json")
        }
        for package in self.packages:
            self.write(f"packages/{package}/src/index.ts", "export {};\n")
            self.write(
                f"packages/{package}/lint.sh",
                "mkdir -p .turbo\n"
                "echo ran >> .turbo/executions\n"
                "test ! -f fail.txt\n",
            )
        self.fixture = "server/testdata/compatibility/cache-test.json"
        self.write(self.fixture, "{}\n")
        subprocess.run(["git", "init", "--quiet"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def turbo(self, *arguments, check=True):
        result = subprocess.run(
            [
                "bun",
                str(ROOT / "node_modules/turbo/bin/turbo"),
                "run",
                "lint",
                "--cache=local:rw",
                "--continue=always",
                f"--cwd={self.root}",
                *arguments,
            ],
            cwd=self.root,
            capture_output=True,
            text=True,
        )
        if check:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def hashes(self):
        report = json.loads(self.turbo("--dry=json").stdout)
        return {
            task["package"].removeprefix("@hanabi-live/"): task["hash"]
            for task in report["tasks"]
            if task["task"] == "lint"
        }

    def assert_invalidates(self, name, content, expected):
        before = self.hashes()
        self.write(name, content)
        after = self.hashes()
        self.assertEqual(
            {package for package in before if before[package] != after[package]},
            expected,
        )

    def test_package_changes_invalidate_transitive_consumers(self):
        for package, consumers in (
            ("client", {"client"}),
            ("data", {"data", "client", "client-new", "testing"}),
            ("game", self.packages),
        ):
            with self.subTest(package=package):
                self.assert_invalidates(
                    f"packages/{package}/src/index.ts",
                    "export const changed = true;\n",
                    consumers,
                )
        self.assert_invalidates(self.fixture, '{"changed": true}\n', self.packages)

    def test_shared_inputs_and_ignored_runtime_version(self):
        for name in (
            "eslint.config.mjs",
            "tsconfig.monorepo.json",
            "bunfig.toml",
            "patches/konva@3.4.1.patch",
        ):
            with self.subTest(name=name):
                self.assert_invalidates(
                    name, (self.root / name).read_text() + "\n", self.packages
                )
        self.assert_invalidates(
            "packages/data/src/version.js",
            'module.exports = { VERSION: "123" };\n',
            set(),
        )
        self.assert_invalidates(
            "packages/data/src/version.d.ts",
            "export const VERSION: string;\n",
            {"data", "client", "client-new", "testing"},
        )
        self.assert_invalidates("server/src/main.rs", "fn main() {}\n", set())

    def test_successes_are_reused_but_failures_are_not(self):
        self.turbo()
        self.turbo()
        for package in self.packages:
            self.assertEqual(
                (self.root / f"packages/{package}/.turbo/executions").read_text(),
                "ran\n",
            )
        self.write("packages/client/fail.txt", "fail\n")
        for _ in range(2):
            self.assertNotEqual(self.turbo(check=False).returncode, 0)
        self.assertEqual(
            (self.root / "packages/client/.turbo/executions").read_text(),
            "ran\nran\nran\n",
        )
        (self.root / "packages/client/fail.txt").unlink()
        self.turbo()
        self.assertEqual(
            (self.root / "packages/client/.turbo/executions").read_text(),
            "ran\nran\nran\n",
        )


if __name__ == "__main__":
    unittest.main()
