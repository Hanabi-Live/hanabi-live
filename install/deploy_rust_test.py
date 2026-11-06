import copy
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.request

import deploy_rust as deploy
import release


class DeployWrapperTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-deploy-wrapper-test-")
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name).resolve()
        self.arguments = self.workspace / "arguments"
        self.input = self.workspace / "input"
        ssh = self.workspace / "ssh"
        ssh.write_text(
            '#!/bin/bash\n'
            'printf "%s\\n" "$@" > "$SSH_TEST_ARGS"\n'
            'cat > "$SSH_TEST_INPUT"\n'
            'echo "remote output"\n'
            'echo "remote error" >&2\n'
            'exit "$SSH_TEST_STATUS"\n'
        )
        ssh.chmod(0o755)
        self.environment = {
            **os.environ,
            "PATH": f"{self.workspace}:{os.environ['PATH']}",
            "SSH_TEST_ARGS": str(self.arguments),
            "SSH_TEST_INPUT": str(self.input),
            "SSH_TEST_STATUS": "0",
        }
        for key in ("GH_TOKEN", "GITHUB_TOKEN_PERSONAL_CLASSIC", "GITHUB_TOKEN"):
            self.environment.pop(key, None)
        self.script = Path(__file__).resolve().parent.parent / "deploy_rust.sh"

    def run_wrapper(self, *arguments):
        return subprocess.run(
            ["bash", str(self.script), *arguments], cwd=self.workspace,
            env=self.environment, text=True, capture_output=True,
        )

    def test_remote_target_and_flag_forwarding(self):
        for flags in ((), ("--check",), ("--apply-migrations",),
                      ("--check", "--apply-migrations")):
            with self.subTest(flags=flags):
                result = self.run_wrapper(*flags)
                self.assertEqual(result.returncode, 0, result.stderr)
                arguments = self.arguments.read_text().splitlines()
                self.assertEqual(arguments[:2], ["-T", "root@hanab.live"])
                self.assertEqual(shlex.split(arguments[2]), ["bash", "-l", "-s", "--", *flags])
                remote = self.input.read_text()
                self.assertIn("cd /root/hanabi-live", remote)
                self.assertIn('exec "$python" install/deploy_rust.py "$@"', remote)
                self.assertNotIn("./deploy_rust.sh", remote)
                self.assertIn("root@hanab.live:/root/hanabi-live", result.stdout)
                self.assertIn("remote output", result.stdout)
                self.assertIn("remote error", result.stderr)

    def test_help_and_invalid_arguments_never_connect(self):
        for flag in ("-h", "--help", "--unknown", "--check; exit 0", ""):
            with self.subTest(flag=flag):
                result = self.run_wrapper(flag)
                self.assertEqual(result.returncode, 0 if flag in ("-h", "--help") else 2)
                self.assertFalse(self.arguments.exists())

    def test_local_token_precedence_and_encrypted_input(self):
        cases = (
            ({"GH_TOKEN": "primary", "GITHUB_TOKEN_PERSONAL_CLASSIC": "classic",
              "GITHUB_TOKEN": "fallback"}, "primary"),
            ({"GH_TOKEN": "", "GITHUB_TOKEN_PERSONAL_CLASSIC": "classic",
              "GITHUB_TOKEN": "fallback"}, "classic"),
            ({"GITHUB_TOKEN": "fallback"}, "fallback"),
            ({"GH_TOKEN": "synthetic ' \" \\ $HOME $(printf expanded)\nnext"},
             "synthetic ' \" \\ $HOME $(printf expanded)\nnext"),
        )
        for environment, expected in cases:
            with self.subTest(environment=environment):
                with patch.dict(self.environment, environment):
                    result = self.run_wrapper("--check")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn(expected, self.arguments.read_text())
                self.assertNotIn(expected, result.stdout + result.stderr)
                prefix = self.input.read_text().split("cd /root/hanabi-live", 1)[0]
                remote = subprocess.run(
                    ["bash", "-c", prefix + 'printf "%s" "$GH_TOKEN"'],
                    env=self.environment, text=True, capture_output=True,
                )
                self.assertEqual(remote.returncode, 0, remote.stderr)
                self.assertEqual(remote.stdout, expected)

    def test_no_local_token_preserves_remote_environment(self):
        result = self.run_wrapper()
        self.assertEqual(result.returncode, 0, result.stderr)
        prefix = self.input.read_text().split("cd /root/hanabi-live", 1)[0]
        remote = subprocess.run(
            ["bash", "-c", prefix + 'printf "%s" "$GH_TOKEN"'],
            env={**self.environment, "GH_TOKEN": "remote-token"},
            text=True, capture_output=True,
        )
        self.assertEqual(remote.returncode, 0, remote.stderr)
        self.assertEqual(remote.stdout, "remote-token")

    def test_remote_failure_and_disconnect_preserve_exit_status(self):
        for status in (42, 255):
            with self.subTest(status=status):
                self.environment["SSH_TEST_STATUS"] = str(status)
                result = self.run_wrapper()
                self.assertEqual(result.returncode, status)
                self.assertEqual("outcome is unknown" in result.stderr, status == 255)
                if status == 255:
                    self.assertIn("deployment.json", result.stderr)
                    self.assertIn("Do not retry or roll back automatically", result.stderr)


class DeployTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-deploy-test-")
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name).resolve()
        self.root = self.workspace / "root"
        self.staged = self.workspace / "staged"
        self.work = self.workspace / "work"
        for directory in (self.root, self.staged, self.work):
            directory.mkdir()
        self.revision = "b" * 40
        self.run = {
            "id": 123, "head_sha": self.revision, "head_branch": "main", "event": "push",
            "status": "completed", "conclusion": "success", "path": ".github/workflows/ci.yml",
            "head_repository": {"full_name": deploy.REPOSITORY},
        }
        self.files = {
            "hanabi-live": "new binary",
            "public/client-new/index.html": "new entrypoint",
            "public/client-new/assets/current.js": "new asset",
            "public/js/bundles/git_revision.txt": self.revision,
            "public/js/bundles/version.txt": "2",
            "packages/data/src/json/chatReplyCommands.json": "[]",
        }
        for name, text in self.files.items():
            target = self.staged / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
            old = self.root / name
            old.parent.mkdir(parents=True, exist_ok=True)
            old.write_text("old " + name)
        (self.root / ".env").write_text("retained configuration")
        (self.root / "public/client-new/assets/previous.js").write_text("previous client")
        self.metadata = {"files": release.files_in(self.staged)}

    def test_only_successful_main_ci_is_eligible(self):
        self.assertEqual(deploy.approved_run([self.run], self.revision), self.run)
        for field, value in (
            ("head_sha", "c" * 40), ("head_branch", "branch"), ("event", "pull_request"),
            ("status", "in_progress"), ("conclusion", "failure"),
            ("path", ".github/workflows/other.yml"),
            ("head_repository", {"full_name": "other/repository"}),
        ):
            run = {**self.run, field: value}
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "no successful CI"):
                deploy.approved_run([run], self.revision)

    def test_unapproved_revision_links_latest_matching_ci_run(self):
        older = {**self.run, "id": 122, "conclusion": "failure"}
        unrelated = {**self.run, "id": 999, "head_sha": "c" * 40}
        pull_request = {**self.run, "id": 1000, "event": "pull_request"}
        for status, conclusion in (
            ("queued", None), ("in_progress", None), ("completed", "failure"),
        ):
            latest = {**self.run, "status": status, "conclusion": conclusion}
            with self.subTest(status=status), self.assertRaises(ValueError) as error:
                deploy.approved_run([unrelated, older, latest, pull_request], self.revision)
            message = str(error.exception)
            self.assertIn(f"CI for main {self.revision} ({conclusion or status})", message)
            self.assertIn(f"https://github.com/{deploy.REPOSITORY}/actions/runs/123", message)
            self.assertNotIn("/runs/999", message)
            self.assertNotIn("/runs/1000", message)
            self.assertIn("no older release was selected", message)

    def test_missing_ci_run_links_workflow_without_selecting_another_revision(self):
        for runs in ([], [{**self.run, "head_sha": "c" * 40}]):
            with self.subTest(runs=runs), self.assertRaises(ValueError) as error:
                deploy.approved_run(runs, self.revision)
            message = str(error.exception)
            self.assertIn(f"No CI run found for main {self.revision}", message)
            self.assertIn(f"https://github.com/{deploy.REPOSITORY}/actions/workflows/ci.yml", message)
            self.assertNotIn("/actions/runs/", message)

    def test_ci_waits_for_matching_revision_then_returns_approved_run(self):
        github = Mock()
        github.json.side_effect = [
            {"workflow_runs": [{**self.run, "head_sha": "c" * 40}]},
            {"workflow_runs": [{**self.run, "status": "queued", "conclusion": None}]},
            {"workflow_runs": [{**self.run, "status": "in_progress", "conclusion": None}]},
            {"workflow_runs": [self.run]},
        ]
        previous_handler = deploy.signal.getsignal(deploy.signal.SIGALRM)
        with patch.object(deploy.time, "sleep") as sleep, \
             patch.object(deploy.signal, "setitimer") as timer, \
             patch("builtins.print") as output:
            self.assertEqual(deploy.await_approved_run(github, self.revision), self.run)
        self.assertEqual(sleep.call_count, 3)
        for call in github.json.call_args_list:
            self.assertIn(f"head_sha={self.revision}", call.args[0])
        self.assertTrue(any("/actions/runs/123" in call.args[0] for call in output.call_args_list))
        self.assertEqual(timer.call_args_list[0].args, (deploy.signal.ITIMER_REAL, 300))
        self.assertEqual(timer.call_args_list[-1].args, (deploy.signal.ITIMER_REAL, 0))
        self.assertEqual(deploy.signal.getsignal(deploy.signal.SIGALRM), previous_handler)

    def test_ci_completed_failure_stops_without_waiting(self):
        for conclusion in ("failure", "cancelled", "timed_out", "skipped"):
            github = Mock()
            github.json.return_value = {
                "workflow_runs": [{**self.run, "conclusion": conclusion}],
            }
            with self.subTest(conclusion=conclusion), \
                 patch.object(deploy.time, "sleep") as sleep, \
                 self.assertRaisesRegex(ValueError, "no successful CI"):
                deploy.await_approved_run(github, self.revision)
            sleep.assert_not_called()

    def test_ci_deadline_interrupts_polling_and_stalled_requests(self):
        def expire(*args):
            deploy.signal.getsignal(deploy.signal.SIGALRM)(deploy.signal.SIGALRM, None)

        for stalled_request in (False, True):
            github = Mock()
            github.json.return_value = {
                "workflow_runs": [{**self.run, "status": "in_progress", "conclusion": None}],
            }
            if stalled_request:
                github.json.side_effect = expire
            previous_handler = deploy.signal.getsignal(deploy.signal.SIGALRM)
            with self.subTest(stalled_request=stalled_request), \
                 patch.object(deploy.time, "sleep", side_effect=expire), \
                 patch.object(deploy.signal, "setitimer") as timer, \
                 self.assertRaisesRegex(TimeoutError, "timed out after 5 minutes") as error:
                deploy.await_approved_run(github, self.revision)
            self.assertIn(self.revision, str(error.exception))
            if not stalled_request:
                self.assertIn("/actions/runs/123", str(error.exception))
            self.assertEqual(timer.call_args_list[-1].args, (deploy.signal.ITIMER_REAL, 0))
            self.assertEqual(deploy.signal.getsignal(deploy.signal.SIGALRM), previous_handler)

    def test_ci_api_errors_fail_instead_of_retrying(self):
        github = Mock()
        github.json.side_effect = urllib.error.HTTPError("https://api.github.com", 403, "Forbidden", {}, None)
        self.addCleanup(github.json.side_effect.close)
        with patch.object(deploy.time, "sleep") as sleep, \
             self.assertRaises(urllib.error.HTTPError):
            deploy.await_approved_run(github, self.revision)
        sleep.assert_not_called()

    def test_artifact_redirect_does_not_forward_github_token(self):
        request = urllib.request.Request("https://api.github.com/example",
                                         headers={"Authorization": "Bearer synthetic"})
        handler = deploy.SafeRedirect()
        other = handler.redirect_request(request, None, 302, "Found", {},
                                         "https://artifacts.example/file")
        self.assertFalse(other.has_header("Authorization"))
        same = handler.redirect_request(request, None, 302, "Found", {},
                                        "https://api.github.com/another")
        self.assertEqual(same.get_header("Authorization"), "Bearer synthetic")
        with self.assertRaisesRegex(ValueError, "Insecure"):
            handler.redirect_request(request, None, 302, "Found", {}, "http://example/file")

    def test_publication_preserves_runtime_state_old_assets_and_running_inode(self):
        before = deploy.backup(self.root, self.staged, self.metadata, self.work)
        names = deploy.runtime_files(self.metadata)
        self.assertLess(names.index("public/client-new/assets/current.js"), names.index("hanabi-live"))
        self.assertLess(names.index("hanabi-live"), names.index("public/client-new/index.html"))
        self.assertEqual(names[-1], "public/js/bundles/version.txt")
        with (self.root / "hanabi-live").open() as running:
            deploy.publish(self.root, self.staged, self.metadata)
            self.assertEqual(running.read(), "old hanabi-live")
        for name, text in self.files.items():
            self.assertEqual((self.root / name).read_text(), text)
            self.assertEqual((before / name).read_text(), "old " + name)
        self.assertEqual((self.root / ".env").read_text(), "retained configuration")
        self.assertEqual((self.root / "public/client-new/assets/previous.js").read_text(), "previous client")
        self.assertFalse((self.root / "release.json").exists())

    def test_corrupt_staging_is_rejected_before_any_publication(self):
        (self.staged / "hanabi-live").write_text("corrupted")
        with self.assertRaisesRegex(ValueError, "Staged file changed"):
            deploy.publish(self.root, self.staged, self.metadata)
        self.assertEqual((self.root / "public/client-new/assets/current.js").read_text(),
                         "old public/client-new/assets/current.js")

    def test_symlink_escape_and_low_disk_are_rejected(self):
        (self.root / "public/client-new/assets/current.js").unlink()
        (self.root / "public/client-new/assets/current.js").symlink_to(self.workspace / "outside")
        with self.assertRaisesRegex(ValueError, "escapes"):
            deploy.backup(self.root, self.staged, self.metadata, self.work)
        (self.root / "public/client-new/assets/current.js").unlink()
        with patch.object(deploy.shutil, "disk_usage") as usage:
            usage.return_value.free = 1
            with self.assertRaisesRegex(ValueError, "disk headroom"):
                deploy.backup(self.root, self.staged, self.metadata, self.work)

    def test_restart_requires_served_revision_and_healthy_recovery(self):
        metrics = {
            "draining": False,
            "recovery": {"storageInitialized": True, "stateHealthy": True,
                         "frozenTables": 0, "pendingTransactions": 0},
        }
        for field, value in (("stateHealthy", False), ("frozenTables", 1), ("pendingTransactions", 1)):
            unhealthy = copy.deepcopy(metrics)
            unhealthy["recovery"][field] = value
            self.assertFalse(deploy.healthy(unhealthy))
        with patch.object(deploy, "control", side_effect=["a" * 40, self.revision, metrics]) as control:
            with patch.object(deploy.time, "sleep"):
                deploy.await_restart(8081, self.revision)
            self.assertEqual(control.call_args_list[-1].args, (8081, "/metrics"))
        with self.assertRaisesRegex(ValueError, "not verified"):
            deploy.await_restart(8081, self.revision, timeout=0)

    def test_failed_publication_never_requests_restart(self):
        (self.root / "public/js/bundles/version.txt").write_text("1")
        metadata = {**self.metadata, "commitCount": 2}
        metrics = {
            "draining": False,
            "recovery": {"storageInitialized": True, "stateHealthy": True,
                         "frozenTables": 0, "pendingTransactions": 0},
        }
        def command(root, *args):
            if args[:3] == ("git", "status", "--porcelain"):
                return ""
            if args[0] == "bash":
                return "8081"
            return "a" * 40

        def control(port, path):
            self.assertNotEqual(path, "/gracefulRestart")
            return metrics if path == "/metrics" else "a" * 40

        with patch.object(deploy, "command", side_effect=command), \
             patch.object(deploy, "control", side_effect=control), \
             patch.object(deploy, "GitHub") as github, \
             patch.object(deploy.subprocess, "run"), \
             patch.object(deploy, "download", return_value=(self.staged, metadata)), \
             patch.object(deploy, "prepare", return_value=False), \
             patch.object(deploy, "publish", side_effect=OSError("publication failed")):
            github.return_value.json.side_effect = [
                {"sha": self.revision}, {"workflow_runs": [self.run]},
            ]
            with self.assertRaisesRegex(OSError, "publication failed"):
                deploy.deploy(self.root, False, False)
        journal = next((self.root / "backups").glob("deploy-rust-*/deployment.json"))
        self.assertEqual(json.loads(journal.read_text())["phase"], "publishing")
        self.assertTrue((journal.parent / "previous/hanabi-live").exists())

    def test_check_mode_and_unapproved_migrations_do_not_change_live_files(self):
        (self.root / "public/js/bundles/version.txt").write_text("1")
        metrics = {
            "draining": False,
            "recovery": {"storageInitialized": True, "stateHealthy": True,
                         "frozenTables": 0, "pendingTransactions": 0},
        }
        def command(root, *args):
            if args[:3] == ("git", "status", "--porcelain"):
                return ""
            return "8081" if args[0] == "bash" else "a" * 40

        for check in (True, False):
            with self.subTest(check=check), \
                 patch.object(deploy, "command", side_effect=command), \
                 patch.object(deploy, "control", side_effect=["a" * 40, metrics]), \
                 patch.object(deploy, "GitHub") as github, \
                 patch.object(deploy.subprocess, "run") as run, \
                 patch.object(deploy, "download", return_value=(self.staged, {"commitCount": 2})), \
                 patch.object(deploy, "prepare", return_value=True), \
                 patch.object(deploy, "publish") as publish, \
                 patch.object(deploy, "backup") as backup:
                github.return_value.json.side_effect = [
                    {"sha": self.revision}, {"workflow_runs": [self.run]},
                ]
                if check:
                    deploy.deploy(self.root, True, False)
                else:
                    with self.assertRaisesRegex(ValueError, "--apply-migrations"):
                        deploy.deploy(self.root, False, False)
                publish.assert_not_called()
                backup.assert_not_called()
                self.assertTrue(all(call.args[0][:2] == ["git", "merge-base"] for call in run.call_args_list))


if __name__ == "__main__":
    unittest.main()
