from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error

import publish_release as publish


class PublicReleaseTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="hanabi-public-release-")
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.revision = "b" * 40
        self.tag = "server-" + self.revision
        self.archive = self.directory / f"hanabi-live-rust-{self.revision}-linux-amd64.tar.gz"
        self.archive.write_bytes(b"synthetic release")
        self.checksum = publish.digest(self.archive) + "  " + self.archive.name + "\n"
        self.archive.with_name(self.archive.name + ".sha256").write_text(self.checksum)
        self.github = Mock()
        self.responses = {}
        self.github.json.side_effect = self.response
        self.client = patch.object(publish, "GitHub", return_value=self.github)
        self.client.start()
        self.addCleanup(self.client.stop)
        self.commands = patch.object(publish.subprocess, "run")
        self.run = self.commands.start()
        self.addCleanup(self.commands.stop)

    def response(self, path):
        if path not in self.responses:
            raise urllib.error.HTTPError(path, 404, "Not found", {}, None)
        return self.responses[path]

    def execute(self):
        publish.publish(self.directory, self.revision, "https://example.invalid/ci")
        return [call.args[0] for call in self.run.call_args_list]

    def test_assets_upload_before_first_release_becomes_public(self):
        commands = self.execute()
        self.assertIn("--draft", commands[0])
        self.assertEqual(commands[1][2], "upload")
        self.assertIn(str(self.archive), commands[1])
        self.assertIn(str(self.directory / "SHA256SUMS"), commands[1])
        self.assertEqual((self.directory / "SHA256SUMS").read_text(), self.checksum)
        self.assertIn("--draft=false", commands[2])
        self.assertIn("--latest=true", commands[2])

    def test_failed_upload_stays_draft_and_can_be_retried(self):
        self.responses[f"/releases/tags/{self.tag}"] = {
            "draft": True, "target_commitish": self.revision,
        }
        self.run.side_effect = subprocess.CalledProcessError(1, ["gh", "release", "upload"])
        with self.assertRaises(subprocess.CalledProcessError):
            self.execute()
        self.assertEqual(self.run.call_count, 1)
        self.assertEqual(self.run.call_args.args[0][2], "upload")
        self.run.reset_mock(side_effect=True)
        commands = self.execute()
        self.assertEqual([command[2] for command in commands], ["upload", "edit"])

    def test_published_assets_are_not_overwritten_on_rerun(self):
        self.responses["/releases/latest"] = {"tag_name": self.tag}
        self.responses[f"/releases/tags/{self.tag}"] = {
            "draft": False, "prerelease": False, "target_commitish": self.revision,
            "assets": [{"name": name, "state": "uploaded"}
                       for name in (self.archive.name, "SHA256SUMS")],
        }
        self.assertEqual(self.execute(), [])

    def test_only_forward_history_can_replace_latest(self):
        for status, base, expected in [
            ("ahead", "a" * 40, "--latest=true"),
            ("behind", self.revision, "--latest=false"),
            ("diverged", "c" * 40, None),
        ]:
            with self.subTest(status=status):
                self.run.reset_mock()
                self.responses["/releases/latest"] = {"tag_name": "server-" + "a" * 40}
                self.responses[f"/compare/{'a' * 40}...{self.revision}"] = {
                    "status": status, "merge_base_commit": {"sha": base},
                }
                if expected is None:
                    with self.assertRaisesRegex(ValueError, "diverged"):
                        self.execute()
                    self.run.assert_not_called()
                else:
                    self.assertIn(expected, self.execute()[-1])

    def test_invalid_checksum_and_api_failures_do_not_publish(self):
        self.archive.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.execute()
        self.run.assert_not_called()
        self.archive.write_bytes(b"synthetic release")
        self.github.json.side_effect = urllib.error.HTTPError("latest", 403, "Forbidden", {}, None)
        with self.assertRaises(urllib.error.HTTPError):
            self.execute()
        self.run.assert_not_called()
