import json
import os
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
            "public/js/bundles/.gitignore",
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
        manifest_path = self.root / "package.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["scripts"]["test"] = "bash packages/testing/test.sh"
        manifest_path.write_text(json.dumps(manifest))
        self.write(
            "packages/testing/test.sh",
            "mkdir -p .turbo\n"
            "echo ran >> .turbo/test-executions\n"
            "test ! -f packages/testing/fail.txt\n",
        )
        manifest_path = self.root / "packages/client-new/package.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["scripts"]["test"] = "bash test.sh"
        manifest_path.write_text(json.dumps(manifest))
        self.write(
            "packages/client-new/test.sh",
            "mkdir -p .turbo\n"
            "echo ran >> .turbo/test-executions\n"
            "test ! -f fail.txt\n",
        )
        manifest_path = self.root / "package.json"
        manifest = json.loads(manifest_path.read_text())
        for task in (
            "check-shellcheck", "check-templates", "check-variant-files", "lint-package-json",
        ):
            manifest["scripts"][task] = f"bash {task}.sh"
            self.write(
                f"{task}.sh",
                "mkdir -p .turbo\n"
                f"echo ran >> .turbo/{task}-executions\n"
                "test ! -f fail.txt\n",
            )
        manifest_path.write_text(json.dumps(manifest))
        subprocess.run(["git", "init", "--quiet"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def turbo(self, *arguments, check=True, task="lint", env=None):
        result = subprocess.run(
            [
                "bun",
                str(ROOT / "node_modules/turbo/bin/turbo"),
                "run",
                task,
                "--cache=local:rw",
                "--continue=always",
                f"--cwd={self.root}",
                *arguments,
            ],
            cwd=self.root,
            capture_output=True,
            text=True,
            env=env,
        )
        if check:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def hashes(self, task="lint", env=None):
        report = json.loads(self.turbo("--dry=json", task=task, env=env).stdout)
        task_name = task.rsplit("#", 1)[-1]
        return {
            entry["package"].removeprefix("@hanabi-live/"): entry["hash"]
            for entry in report["tasks"]
            if entry["task"] == task_name
        }

    def assert_invalidates(self, name, content, expected, task="lint"):
        before = self.hashes(task)
        self.write(name, content)
        after = self.hashes(task)
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

    def test_cache_regression_suite_inputs_invalidate_results(self):
        task = "//#test-lint-caches"
        for name in (
            "scripts/lint_cache_test.py",
            "scripts/prettier_cache_test.py",
            "check-prettier.sh",
            "prettier.config.mjs",
            "turbo.json",
            "package.json",
            "bun.lock",
            "packages/client/package.json",
            "tsconfig.monorepo.json",
        ):
            with self.subTest(name=name):
                source = self.root / name
                content = source.read_text() if source.exists() else ""
                self.assert_invalidates(name, content + "\n", {"//"}, task)
        self.assert_invalidates("docs/install.md", "Documentation.\n", set(), task)
        self.assertNotEqual(
            self.hashes(task),
            self.hashes(task, {**os.environ, "ImageVersion": "changed"}),
        )

    def test_cache_regression_suite_reuses_only_successes(self):
        task = "//#test-lint-caches"
        self.write(
            "scripts/lint_cache_test.py",
            'from pathlib import Path\n'
            'import unittest\n'
            'class Fixture(unittest.TestCase):\n'
            '    def test_result(self):\n'
            '        Path(".turbo").mkdir(exist_ok=True)\n'
            '        with Path(".turbo/regression-executions").open("a") as output:\n'
            '            output.write("ran\\n")\n'
            '        self.assertFalse(Path("scripts/fail.txt").exists())\n',
        )
        self.write(
            "scripts/prettier_cache_test.py",
            "import unittest\n"
            "class Fixture(unittest.TestCase):\n"
            "    def test_result(self):\n"
            "        pass\n",
        )
        executions = self.root / ".turbo/regression-executions"
        self.turbo(task=task)
        self.turbo(task=task)
        self.assertEqual(executions.read_text(), "ran\n")
        self.write("scripts/fail.txt", "fail\n")
        for _ in range(2):
            self.assertNotEqual(self.turbo(task=task, check=False).returncode, 0)
        self.assertEqual(executions.read_text(), "ran\nran\nran\n")
        (self.root / "scripts/fail.txt").unlink()
        self.turbo(task=task)
        self.assertEqual(executions.read_text(), "ran\nran\nran\n")

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

    def test_repository_checks_reuse_only_successes(self):
        for task in (
            "check-shellcheck", "check-templates", "check-variant-files", "lint-package-json",
        ):
            with self.subTest(task=task):
                executions = self.root / f".turbo/{task}-executions"
                self.turbo(task=f"//#{task}")
                self.turbo(task=f"//#{task}")
                self.assertEqual(executions.read_text(), "ran\n")
                self.write("fail.txt", "fail\n")
                for _ in range(2):
                    self.assertNotEqual(
                        self.turbo(task=f"//#{task}", check=False).returncode, 0,
                    )
                self.assertEqual(executions.read_text(), "ran\nran\nran\n")
                (self.root / "fail.txt").unlink()
                self.turbo(task=f"//#{task}")
                self.assertEqual(executions.read_text(), "ran\nran\nran\n")

    def test_repository_checks_hash_sources_and_shellcheck_discovery(self):
        for task, name in (
            ("check-templates", ".github/workflows/ci.yml"),
            ("check-templates", "README.md"),
            ("check-variant-files", "misc/variants.txt"),
            ("check-variant-files", "packages/game/src/json/suits.json"),
            ("lint-package-json", "packages/scripts/src/dependencyCatalog.ts"),
            ("check-shellcheck", "server/target/generated.sh"),
            ("check-shellcheck", ".shellcheckrc"),
        ):
            with self.subTest(task=task, name=name):
                self.assert_invalidates(name, "changed\n", {"//"}, f"//#{task}")
        for name in (
            "docs/install.md", "node_modules/ignored.sh", ".husky/ignored.sh", "dist/ignored.sh",
        ):
            with self.subTest(ignored=name):
                self.assert_invalidates(name, "ignored\n", set(), "//#check-shellcheck")
        for task in (
            "check-shellcheck", "check-templates", "check-variant-files", "lint-package-json",
        ):
            with self.subTest(environment=task):
                before = self.hashes(f"//#{task}")
                self.assertNotEqual(
                    before, self.hashes(f"//#{task}", {**os.environ, "ImageVersion": "changed"}),
                )

    def test_suite_inputs_include_native_and_shared_dependencies(self):
        for name in (
            "packages/client/src/index.ts",
            "packages/data/src/index.ts",
            "packages/game/src/index.ts",
            "packages/scripts/src/index.ts",
            "packages/testing/src/mainProcessSetup.ts",
            "packages/client/set-version.sh",
            "server/src/main.rs",
            "server/engine/src/lib.rs",
            "server/protocol/fixtures/compatibility.json",
            "server/build.rs",
            "server/Cargo.lock",
            "server/.sqlx/query.json",
            "install/database_schema.sql",
            "install/migrations/baseline.txt",
            "install/migrations/007_change.sql",
            "public/img/favicon.ico",
            ".cargo/config.toml",
            "rust-toolchain.toml",
            ".github/workflows/ci.yml",
            ".github/workflows/setup-redis/action.yml",
            ".github/workflows/setup-rust/action.yml",
            "scripts/bash/generate-protocol.sh",
            "tsconfig.monorepo.json",
            "bunfig.toml",
            "patches/konva@3.4.1.patch",
        ):
            with self.subTest(name=name):
                source = self.root / name
                content = source.read_text() if source.exists() else ""
                self.assert_invalidates(name, content + "\n", {"//"}, "//#test")
        for name in (
            "docs/install.md",
            "README.md",
            "packages/data/src/version.js",
            "server/target/release/hanabi-live",
            "node_modules/example/index.js",
            "public/js/bundles/version.txt",
        ):
            with self.subTest(name=name):
                self.assert_invalidates(name, "generated\n", set(), "//#test")

    def test_suite_environment_invalidates_results(self):
        environment = dict(os.environ)
        environment.pop("HANABI_TEST_DATABASE_URL", None)
        before = self.hashes("//#test", environment)
        for name, value in (
            ("HANABI_TEST_DATABASE_URL", "postgres://postgres@127.0.0.1/postgres"),
            ("HANABI_BUILD_REVISION", "a" * 40),
            ("RUSTFLAGS", "-C opt-level=1"),
            ("RUSTUP_TOOLCHAIN", "stable"),
            ("ImageVersion", "different-image"),
        ):
            with self.subTest(name=name):
                after = self.hashes("//#test", {**environment, name: value})
                self.assertNotEqual(before, after)

    def test_suite_successes_are_reused_but_failures_are_not(self):
        executions = self.root / ".turbo/test-executions"
        self.turbo(task="//#test")
        self.write("docs/install.md", "Documentation-only change.\n")
        self.turbo(task="//#test")
        self.assertEqual(executions.read_text(), "ran\n")
        self.write("packages/testing/fail.txt", "fail\n")
        for _ in range(2):
            self.assertNotEqual(self.turbo(task="//#test", check=False).returncode, 0)
        self.assertEqual(executions.read_text(), "ran\nran\nran\n")
        (self.root / "packages/testing/fail.txt").unlink()
        self.turbo(task="//#test")
        self.assertEqual(executions.read_text(), "ran\nran\nran\n")

    def test_vitest_inputs_include_workspace_and_runtime_dependencies(self):
        task = "@hanabi-live/client-new#test"
        for name in (
            "packages/client-new/src/index.ts",
            "packages/client-new/tests/connection.test.ts",
            "packages/client-new/vite.config.ts",
            "packages/client-new/vitest.config.ts",
            "packages/client-new/tsconfig.json",
            "packages/data/src/index.ts",
            "packages/game/src/index.ts",
            "packages/testing/src/index.ts",
            "packages/client/get-version.sh",
            "package.json",
            "tsconfig.monorepo.json",
            "bunfig.toml",
            ".github/workflows/ci.yml",
            ".github/workflows/setup-bun/action.yml",
        ):
            with self.subTest(name=name):
                source = self.root / name
                content = source.read_text() if source.exists() else ""
                self.assert_invalidates(name, content + "\n", {"client-new"}, task)
        for name in (
            "docs/install.md",
            "server/src/main.rs",
            "packages/client/src/index.ts",
            "packages/data/src/version.js",
            "public/client-new/index.html",
        ):
            with self.subTest(name=name):
                self.assert_invalidates(name, "unrelated\n", set(), task)

    def test_vitest_environment_invalidates_results(self):
        task = "@hanabi-live/client-new#test"
        environment = dict(os.environ)
        for name in ("HANABI_BUILD_REVISION", "NODE_ENV", "ImageVersion", "TZ"):
            environment.pop(name, None)
        before = self.hashes(task, environment)
        for name, value in (
            ("HANABI_BUILD_REVISION", "a" * 40),
            ("NODE_ENV", "production"),
            ("ImageVersion", "different-image"),
            ("TZ", "UTC"),
        ):
            with self.subTest(name=name):
                after = self.hashes(task, {**environment, name: value})
                self.assertNotEqual(before, after)

    def test_vitest_successes_are_reused_but_failures_are_not(self):
        task = "@hanabi-live/client-new#test"
        executions = self.root / "packages/client-new/.turbo/test-executions"
        self.turbo(task=task)
        self.write("docs/install.md", "Documentation-only change.\n")
        self.turbo(task=task)
        self.assertEqual(executions.read_text(), "ran\n")
        self.write("packages/client-new/fail.txt", "fail\n")
        for _ in range(2):
            self.assertNotEqual(self.turbo(task=task, check=False).returncode, 0)
        self.assertEqual(executions.read_text(), "ran\nran\nran\n")
        (self.root / "packages/client-new/fail.txt").unlink()
        self.turbo(task=task)
        self.assertEqual(executions.read_text(), "ran\nran\nran\n")


if __name__ == "__main__":
    unittest.main()
