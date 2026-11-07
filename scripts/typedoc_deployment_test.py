import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

import typedoc_deployment as deployment


class TypeDocDeploymentTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-docs-deployment-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.git("init", "--quiet")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "commit.gpgsign", "false")
        self.write("packages/game/src/index.ts", "export const version = 1;\n")
        self.initial = self.commit()

    def git(self, *arguments):
        return deployment.git(self.root, *arguments).stdout.strip()

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def commit(self):
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "Fixture")
        return self.git("rev-parse", "HEAD")

    def history(self, revision, state="success"):
        return Mock(side_effect=[
            [{"id": 10, "sha": revision}],
            [] if state is None else [{"state": state}],
            {"id": 20, "sha": self.git("rev-parse", "HEAD")},
        ])

    def test_unrelated_commits_skip_without_creating_a_deployment(self):
        self.write("server/src/main.rs", "fn main() {}\n")
        self.write("docs/install.md", "Installation instructions.\n")
        self.write("packages/client/src/main.ts", "export {};\n")
        self.commit()
        request = self.history(self.initial)
        self.assertIsNone(deployment.prepare(self.root, request))
        self.assertEqual(request.call_count, 2)

    def test_documentation_inputs_and_configuration_changes_publish(self):
        for name in (
            "packages/game/src/index.ts",
            "packages/game/README.md",
            "package.json",
            "bun.lock",
            "bunfig.toml",
            "tsconfig.monorepo.json",
            "typedoc.json",
            "tsdoc.json",
            "patches/library.patch",
            ".github/workflows/ci.yml",
            ".github/workflows/setup-bun/action.yml",
            "scripts/typedoc_deployment.py",
        ):
            with self.subTest(name=name):
                previous = self.git("rev-parse", "HEAD")
                self.write(name, "changed\n")
                self.commit()
                request = self.history(previous)
                self.assertEqual(deployment.prepare(self.root, request), 20)
                self.assertEqual(request.call_args.args[0], "deployments")
                self.assertFalse(request.call_args.args[1]["auto_merge"])

    def test_first_failed_and_interrupted_attempts_publish(self):
        request = Mock(side_effect=[[], {"id": 20, "sha": self.initial}])
        self.assertEqual(deployment.prepare(self.root, request), 20)
        for state in (None, "failure", "error", "pending", "queued", "in_progress", "inactive"):
            with self.subTest(state=state):
                self.assertEqual(deployment.prepare(self.root, self.history(self.initial, state)), 20)

    def test_reverting_to_older_content_still_replaces_the_live_site(self):
        self.write("packages/game/src/index.ts", "export const version = 2;\n")
        published = self.commit()
        self.write("packages/game/src/index.ts", "export const version = 1;\n")
        self.commit()
        self.assertEqual(deployment.prepare(self.root, self.history(published)), 20)

    def test_shallow_checkout_fetches_the_deployed_revision(self):
        self.write("docs/install.md", "Unrelated change.\n")
        self.commit()
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-docs-shallow-")
        self.addCleanup(temporary.cleanup)
        clone = Path(temporary.name)
        subprocess.run(
            ["git", "clone", "--quiet", "--depth=1", self.root.as_uri(), str(clone)],
            check=True,
        )
        self.assertIsNone(deployment.prepare(clone, self.history(self.initial)))

    def test_api_errors_and_malformed_revisions_do_not_skip(self):
        request = Mock(side_effect=RuntimeError("API unavailable"))
        with self.assertRaisesRegex(RuntimeError, "API unavailable"):
            deployment.prepare(self.root, request)
        with self.assertRaisesRegex(ValueError, "Invalid deployed TypeDoc revision"):
            deployment.prepare(self.root, self.history("--invalid"))

    def test_completion_records_publication_outcome_without_inactivating_other_deployments(self):
        request = Mock()
        for state in ("success", "failure"):
            with self.subTest(state=state):
                deployment.record(request, 20, state, "https://github.com/example/repo/actions/runs/1")
                path, payload = request.call_args.args
                self.assertEqual(path, "deployments/20/statuses")
                self.assertEqual(payload["state"], state)
                self.assertFalse(payload["auto_inactive"])


if __name__ == "__main__":
    unittest.main()
