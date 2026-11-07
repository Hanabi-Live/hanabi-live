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

    def check(self, success=True, ci=True):
        result = subprocess.run(
            ["bash", "check-spelling.sh"],
            cwd=self.root,
            capture_output=True,
            text=True,
            env={**os.environ, "CI": "true" if ci else "false"},
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

    def test_ci_leaves_unused_words_to_maintenance_but_local_checks_them(self):
        word = "spell" + "cache" + "word"
        self.configure([word])
        self.sample.write_text(f"{word}\n")
        self.check()
        self.check()
        self.sample.write_text("hello\n")
        for _ in range(2):
            self.check()
            self.assertIn("not being used", self.check(success=False, ci=False))

    def workflow_script(self, step_id):
        workflow = ROOT / ".github/workflows/cspell-unused-words.yml"
        return subprocess.run(
            [
                "bun", "-e",
                "const workflow = Bun.YAML.parse(await Bun.file(process.argv[1]).text());"
                "console.log(workflow.jobs.cleanup.steps.find(step => step.id === process.argv[2]).run);",
                str(workflow), step_id,
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout

    def test_maintenance_fixes_unused_words_and_then_becomes_a_noop(self):
        word = "spell" + "cache" + "word"
        self.configure([word])
        script = self.workflow_script("cleanup")
        subprocess.run(["git", "init", "--quiet"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        output = self.root / "output.txt"
        environment = {**os.environ, "GITHUB_OUTPUT": str(output), "CI": "true"}
        subprocess.run(["bash", "-e", "-c", script], cwd=self.root, env=environment, check=True)
        self.assertEqual(output.read_text(), "changed=true\n")
        self.assertNotIn(word, (self.root / "cspell.config.jsonc").read_text())
        self.check()
        subprocess.run(["git", "add", "cspell.config.jsonc"], cwd=self.root, check=True)
        output.unlink()
        subprocess.run(["bash", "-e", "-c", script], cwd=self.root, env=environment, check=True)
        self.assertEqual(output.read_text(), "changed=false\n")

    def test_maintenance_commit_pushes_only_the_configuration(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-spelling-remote-")
        self.addCleanup(temporary.cleanup)
        remote = Path(temporary.name)

        def git(*arguments):
            return subprocess.run(
                ["git", *arguments], cwd=self.root, check=True,
                capture_output=True, text=True,
            ).stdout.strip()

        self.configure(["spell" + "cache" + "word"])
        git("init", "--quiet", "--initial-branch=main")
        git("config", "user.name", "Test")
        git("config", "user.email", "test@example.com")
        git("config", "commit.gpgsign", "false")
        git("add", ".")
        git("commit", "--quiet", "-m", "Initial fixture")
        git("init", "--quiet", "--bare", "--initial-branch=main", str(remote))
        git("remote", "add", "origin", str(remote))
        git("push", "--quiet", "origin", "main")
        self.configure([])
        (self.root / "unrelated.txt").write_text("Do not commit this file.\n")
        tools = self.root / "tools"
        tools.mkdir()
        auth = tools / "gh"
        auth.write_text('#!/usr/bin/env bash\n[[ "$*" == "auth setup-git" ]]\n')
        auth.chmod(0o755)
        subprocess.run(
            ["bash", "-e", "-c", self.workflow_script("commit")],
            cwd=self.root, check=True,
            env={**os.environ, "PATH": f"{tools}{os.pathsep}{os.environ['PATH']}"},
        )
        self.assertEqual(
            git("--git-dir", str(remote), "log", "-1", "--format=%s"),
            "chore: remove unused words from the CSpell configuration file",
        )
        self.assertEqual(
            git("--git-dir", str(remote), "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"),
            "cspell.config.jsonc",
        )
        self.assertIn("?? unrelated.txt", git("status", "--short"))


if __name__ == "__main__":
    unittest.main()
