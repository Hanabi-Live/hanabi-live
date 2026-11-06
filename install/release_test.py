import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import unittest
from unittest.mock import patch
import uuid

import release


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.workspace = Path("dist/release-tests", str(uuid.uuid4())).resolve()
        self.workspace.mkdir(parents=True)
        self.addCleanup(shutil.rmtree, self.workspace)
        self.root = self.workspace / "deployment"
        release.init_root(str(self.root))
        (self.root / "shared/.env").write_text("DB_NAME=release_test\n")
        (self.root / "shared/logs/retained.log").write_text("retained log")
        self.revision = "a" * 40
        self.release_name = self.revision + "-rust"
        self.artifact = self.workspace / "artifact"
        self.artifact.mkdir()
        contents = {
            "hanabi-live": f"#!/bin/sh\necho {self.revision}\n",
            "install/tern": "#!/bin/sh\nexit 0\n",
            "install/migrate.sh": "#!/bin/sh\nexit 0\n",
            "install/migration-files.sh": "# migration helper\n",
            "packages/data/src/json/chatReplyCommands.json": "[]\n",
            "public/js/bundles/version.txt": self.revision + "\n",
            "public/js/bundles/git_revision.txt": self.revision + "\n",
            f"public/js/bundles/main.{self.revision}.min.js": "client",
            f"public/css/main.{self.revision}.min.css": "css",
        }
        for name, value in contents.items():
            path = self.artifact / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        (self.artifact / "hanabi-live").chmod(0o755)
        self.metadata = {
            "format": 2,
            "runtime": "rust",
            "platform": "linux-amd64",
            "revision": self.revision,
            "clientVersion": self.revision,
            "files": release.files_in(self.artifact),
        }
        self.write_manifest()
        self.archive = self.workspace / "release.tar.gz"
        self.pack()

    def write_manifest(self):
        (self.artifact / "release.json").write_text(json.dumps(self.metadata))

    def pack(self):
        with tarfile.open(self.archive, "w:gz") as stream:
            stream.add(self.artifact, arcname=".")

    def stage(self):
        release.stage(self.root, self.archive, release.digest(self.archive))

    def set_identity(self, revision, version, format_version=2):
        previous = self.metadata["clientVersion"]
        (self.artifact / "hanabi-live").write_text(f"#!/bin/sh\necho {revision}\n")
        (self.artifact / "public/js/bundles/git_revision.txt").write_text(revision + "\n")
        (self.artifact / "public/js/bundles/version.txt").write_text(version + "\n")
        for directory, extension in (("public/js/bundles", "js"), ("public/css", "css")):
            (self.artifact / directory / f"main.{previous}.min.{extension}").rename(
                self.artifact / directory / f"main.{version}.min.{extension}"
            )
        self.metadata.update(
            revision=revision, clientVersion=version, format=format_version,
            files=release.files_in(self.artifact),
        )
        if format_version == 1:
            self.metadata["commitCount"] = int(version)
        else:
            self.metadata.pop("commitCount", None)
        self.write_manifest()
        self.pack()

    def test_stage_and_activate_preserve_shared_state(self):
        self.stage()
        self.assertFalse((self.root / "current").exists())
        release.activate(self.root, self.revision)
        self.assertEqual((self.root / "current").resolve().name, self.release_name)
        self.assertEqual(
            (self.root / "current/logs/retained.log").read_text(),
            "retained log",
        )
        with self.assertRaisesRegex(ValueError, "Rollback/re-activation refused"):
            release.activate(self.root, self.revision)

    def test_corrupt_archive_never_stages(self):
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            release.stage(self.root, self.archive, "0" * 64)
        self.assertEqual(list((self.root / "releases").iterdir()), [])

    def test_existing_release_with_underscore_migration_helper_remains_verifiable(self):
        helper = self.artifact / "install/migration-files.sh"
        previous = helper.with_name("migration_files.sh")
        helper.rename(previous)
        self.metadata["files"] = release.files_in(self.artifact)
        self.write_manifest()
        self.pack()
        self.stage()
        release.verify(self.root / "releases" / self.release_name)
        previous.write_text("changed after verification\n")
        with self.assertRaisesRegex(ValueError, "checksums"):
            release.verify(self.artifact)

    def test_go_bundles_cannot_be_staged_or_activated(self):
        self.metadata["runtime"] = "go"
        self.write_manifest()
        self.pack()
        with self.assertRaisesRegex(ValueError, "Only Rust releases"):
            self.stage()
        with self.assertRaisesRegex(ValueError, "Only Rust releases"):
            release.activate(self.root, self.revision, "go")

    def test_unknown_runtime_is_rejected(self):
        self.metadata["runtime"] = "unknown"
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "Unsupported runtime"):
            release.verify(self.artifact)

    def test_sha_manifest_rejects_mismatched_client_identity(self):
        release.verify(self.artifact)
        for version in ("10", "b" * 40, self.revision[:12]):
            with self.subTest(version=version):
                self.metadata["clientVersion"] = version
                self.write_manifest()
                with self.assertRaisesRegex(ValueError, "Invalid client cache version"):
                    release.verify(self.artifact)

    def test_legacy_manifest_can_upgrade_to_sha_release(self):
        previous = "b" * 40
        self.set_identity(previous, "10", 1)
        self.stage()
        release.activate(self.root, previous)
        self.set_identity(self.revision, self.revision)
        self.stage()
        with patch.object(release, "GitHub") as github:
            github.return_value.json.return_value = {
                "status": "ahead", "merge_base_commit": {"sha": previous},
            }
            release.activate(self.root, self.revision)
            github.return_value.json.assert_called_once_with(f"/compare/{previous}...{self.revision}")
        self.assertEqual((self.root / "current").resolve().name, self.release_name)

    def test_shallow_checkout_produces_full_sha_version(self):
        source = self.workspace / "source"
        subprocess.run(["git", "init", "--quiet", str(source)], check=True)
        script = source / "packages/client/get-version.sh"
        script.parent.mkdir(parents=True)
        shutil.copyfile("packages/client/get-version.sh", script)
        subprocess.run(["git", "add", "."], cwd=source, check=True)
        for message in ("first", "second"):
            subprocess.run(
                ["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "--no-gpg-sign", "--quiet", "--allow-empty", "-m", message],
                cwd=source, check=True,
            )
        expected = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
        shallow = self.workspace / "shallow"
        subprocess.run(["git", "clone", "--quiet", "--depth=1", source.as_uri(), str(shallow)], check=True)
        self.assertEqual(
            subprocess.check_output(["git", "rev-parse", "--is-shallow-repository"],
                                    cwd=shallow, text=True).strip(),
            "true",
        )
        version = subprocess.check_output(
            ["bash", "-c", 'source packages/client/get-version.sh; printf "%s" "$VERSION"'],
            cwd=shallow, text=True,
        )
        self.assertEqual(version, expected)

    def test_staged_rename_sync_failure_reports_changed_state(self):
        original_sync = release.sync_directory

        def fail_final_sync(directory):
            if directory == self.root / "releases":
                raise OSError("injected directory sync failure")
            original_sync(directory)

        error_output = io.StringIO()
        arguments = [
            "release.py", "stage", str(self.root), str(self.archive), release.digest(self.archive),
        ]
        with patch.object(sys, "argv", arguments), patch.object(
            release, "sync_directory", side_effect=fail_final_sync
        ), contextlib.redirect_stderr(error_output), self.assertRaises(SystemExit) as failure:
            release.main()
        self.assertEqual(failure.exception.code, 2)
        self.assertIn("Staged release was renamed", error_output.getvalue())
        self.assertIn("current was NOT changed", error_output.getvalue())
        self.assertNotIn("operation refused", error_output.getvalue())
        self.assertTrue((self.root / "releases" / self.release_name).is_dir())
        self.assertFalse((self.root / "current").exists())

    def test_activation_sync_failure_reports_changed_pointer(self):
        self.stage()
        error_output = io.StringIO()
        arguments = [
            "release.py", "activate", str(self.root), self.revision, "--apply-migrations",
        ]
        with patch.object(sys, "argv", arguments), patch.object(
            release, "sync_directory", side_effect=OSError("injected directory sync failure")
        ), contextlib.redirect_stderr(error_output), self.assertRaises(SystemExit) as failure:
            release.main()
        self.assertEqual(failure.exception.code, 2)
        self.assertIn(f"current was changed to {self.revision}", error_output.getvalue())
        self.assertIn("Activation durability is uncertain", error_output.getvalue())
        self.assertNotIn("operation refused", error_output.getvalue())
        self.assertEqual((self.root / "current").resolve().name, self.release_name)
        self.assertEqual((self.root / "shared/logs/retained.log").read_text(), "retained log")

    def test_legacy_chat_layout_retains_checksum_validation(self):
        current = self.artifact / "packages/data/src/json/chatReplyCommands.json"
        legacy = self.artifact / "packages/server/src/json/chatReplyCommands.json"
        legacy.parent.mkdir(parents=True)
        current.rename(legacy)
        self.metadata["files"] = release.files_in(self.artifact)
        self.write_manifest()
        release.verify(self.artifact)
        legacy.write_text("corrupt")
        with self.assertRaisesRegex(ValueError, "checksums or file set differ"):
            release.verify(self.artifact)

    def test_missing_chat_commands_are_rejected_even_with_matching_hashes(self):
        (self.artifact / "packages/data/src/json/chatReplyCommands.json").unlink()
        self.metadata["files"] = release.files_in(self.artifact)
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "Missing required file: .*chatReplyCommands.json"):
            release.verify(self.artifact)

    def test_older_release_is_rejected_before_migration(self):
        self.stage()
        release.activate(self.root, self.revision)
        older_revision = "b" * 40
        self.set_identity(older_revision, older_revision)
        self.stage()
        for status, base in (("behind", older_revision), ("diverged", "c" * 40),
                             ("ahead", "c" * 40)):
            with self.subTest(status=status), patch.object(release, "GitHub") as github, \
                 patch.object(release.subprocess, "run", wraps=subprocess.run) as calls:
                github.return_value.json.return_value = {
                    "status": status, "merge_base_commit": {"sha": base},
                }
                with self.assertRaisesRegex(ValueError, "Rollback/re-activation refused"):
                    release.activate(self.root, older_revision)
                self.assertFalse(any(call.args[0][0] == "bash" for call in calls.call_args_list))
        self.assertEqual((self.root / "current").resolve().name, self.release_name)

    def test_ancestry_lookup_failure_leaves_current_unchanged(self):
        self.stage()
        release.activate(self.root, self.revision)
        revision = "b" * 40
        self.set_identity(revision, revision)
        self.stage()
        with patch.object(release, "GitHub") as github, \
             patch.object(release.subprocess, "run", wraps=subprocess.run) as calls:
            github.return_value.json.side_effect = OSError("GitHub unavailable")
            with self.assertRaisesRegex(OSError, "GitHub unavailable"):
                release.activate(self.root, revision)
            self.assertFalse(any(call.args[0][0] == "bash" for call in calls.call_args_list))
        self.assertEqual((self.root / "current").resolve().name, self.release_name)

    def test_corrupt_or_unpaired_assets_never_stage(self):
        (self.artifact / "public/js/bundles/version.txt").write_text("11\n")
        self.pack()
        with self.assertRaisesRegex(ValueError, "checksums"):
            self.stage()
        self.metadata["files"] = release.files_in(self.artifact)
        self.write_manifest()
        self.pack()
        with self.assertRaisesRegex(ValueError, "Client/server mismatch"):
            self.stage()
        self.assertFalse((self.root / "current").exists())

    def test_binary_revision_must_match(self):
        binary = self.artifact / "hanabi-live"
        binary.write_text("#!/bin/sh\necho wrong\n")
        self.metadata["files"]["hanabi-live"] = release.digest(binary)
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "Compiled server revision"):
            release.verify(self.artifact)

    def test_missing_release_metadata_never_falls_back_to_compilation(self):
        (self.artifact / "release.json").unlink()
        (self.artifact / ".env").write_text("DB_NAME=release_test\n")
        for name in ("migrate.sh", "migration-files.sh"):
            shutil.copyfile(Path("install") / name, self.artifact / "install" / name)
        migrations = self.artifact / "install/migrations"
        migrations.mkdir()
        (migrations / "001_test.sql").write_text("SELECT 1;\n")
        fake_bin = self.workspace / "bin"
        fake_bin.mkdir()
        marker = self.workspace / "compiled"
        fake_go = fake_bin / "go"
        fake_go.write_text(f"#!/bin/sh\ntouch '{marker}'\nexit 1\n")
        fake_go.chmod(0o755)
        result = subprocess.run(
            ["bash", str(self.artifact / "install/migrate.sh"), "apply"],
            env=dict(os.environ, PATH=str(fake_bin) + os.pathsep + os.environ["PATH"]),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing release metadata", result.stderr)
        self.assertFalse(marker.exists())

    def test_archive_cannot_escape_or_include_runtime_state(self):
        for name in ("../escape", "/absolute", ".env", ".git/config", "public/.env", "public/.git/config"):
            with self.subTest(name=name):
                with tarfile.open(self.archive, "w:gz") as stream:
                    member = tarfile.TarInfo(name)
                    stream.addfile(member)
                with self.assertRaises(ValueError):
                    self.stage()
                self.assertFalse((self.root / "current").exists())
        (self.artifact / "escape").symlink_to("/etc/passwd")
        self.pack()
        with self.assertRaisesRegex(ValueError, "links and special"):
            self.stage()

    def test_failed_migration_retains_old_pointer_and_shared_files(self):
        self.stage()
        old = self.root / "releases" / ("b" * 40)
        shutil.copytree(self.artifact, old)
        metadata = dict(self.metadata, revision="b" * 40, clientVersion="b" * 40)
        # Verification of the independent old fixture is irrelevant to migration failure.
        (self.root / "current").symlink_to(old.relative_to(self.root))
        original_verify = release.verify
        original_run = subprocess.run

        def fail_migration(command, *args, **kwargs):
            if command[0] == "bash":
                raise subprocess.CalledProcessError(1, command)
            return original_run(command, *args, **kwargs)

        with patch.object(
            release, "verify", side_effect=lambda path: metadata if path == old else original_verify(path)
        ), patch.object(
            release.subprocess, "run", side_effect=fail_migration
        ) as calls, patch.object(
            release, "GitHub"
        ) as github:
            github.return_value.json.return_value = {
                "status": "ahead", "merge_base_commit": {"sha": metadata["revision"]},
            }
            with self.assertRaises(subprocess.CalledProcessError):
                release.activate(self.root, self.revision)
            self.assertTrue(any(call.args[0][0] == "bash" for call in calls.call_args_list))
        self.assertEqual((self.root / "current").resolve(), old)
        self.assertEqual((self.root / "shared/logs/retained.log").read_text(), "retained log")

    def test_running_release_blocks_activation_before_migration(self):
        self.stage()
        with release.locked(self.root), patch.object(release.subprocess, "run") as migrate:
            with self.assertRaises(BlockingIOError):
                release.activate(self.root, self.revision)
            migrate.assert_not_called()
        self.assertFalse((self.root / "current").exists())

    def test_unsafe_root_and_mutated_install_are_rejected(self):
        with self.assertRaises(ValueError):
            release.deployment_root(str(self.workspace))
        linked_root = self.workspace / "linked"
        linked_root.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            release.deployment_root(str(linked_root))
        self.stage()
        binary = self.root / "releases" / self.release_name / "hanabi-live"
        binary.write_text("corrupt")
        with patch.object(release.subprocess, "run") as migrate:
            with self.assertRaisesRegex(ValueError, "checksums"):
                release.activate(self.root, self.revision)
            migrate.assert_not_called()
        self.assertFalse((self.root / "current").exists())


if __name__ == "__main__":
    unittest.main()
