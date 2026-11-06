from pathlib import Path
import subprocess
import tempfile
import unittest


class MigrationFilesTest(unittest.TestCase):
    def check_files(self, files):
        with tempfile.TemporaryDirectory(prefix="hanabi-migration-files-") as directory:
            for name, contents in files.items():
                (Path(directory) / name).write_text(contents)
            return subprocess.run(
                ["bash", "-c", 'source "$1"; get_migration_version "$2"', "--",
                 str(Path(__file__).with_name("migration_files.sh")), directory],
                capture_output=True, text=True, timeout=10,
            )

    def test_consecutive_versions(self):
        for files, version in [
            ([], 0),
            (["002_second.sql", "001_first.sql"], 2),
            (["unversioned.sql"], None),
            (["000_zero.sql"], None),
            (["001_first.sql", "003_gap.sql"], None),
            (["001_first.sql", "0001_duplicate.sql"], None),
        ]:
            with self.subTest(files=files):
                result = self.check_files(dict.fromkeys(files, "SELECT 1;\n"))
                if version is None:
                    self.assertNotEqual(result.returncode, 0)
                else:
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(result.stdout.strip(), str(version))

    def test_down_migrations_are_rejected(self):
        result = self.check_files({
            "001_probe.sql": "SELECT 1;\n---- create above / drop below ----\nSELECT 2;\n",
        })
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Down migrations", result.stderr)
