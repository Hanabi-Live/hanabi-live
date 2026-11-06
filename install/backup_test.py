import gzip
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(all(shutil.which(tool) for tool in ("bash", "gzip", "flock")), "backup tools required")
class BackupTest(unittest.TestCase):
    def test_streaming_failure_cleanup_and_disk_reserve(self):
        for available, dump_fails, gzip_fails, success in [
            (2097152, False, False, True),
            (2097152, True, False, False),
            (2097152, False, True, False),
            (1048577, False, False, False),
            (1048576, False, False, False),
        ]:
            with self.subTest(available=available, dump_fails=dump_fails, gzip_fails=gzip_fails):
                with tempfile.TemporaryDirectory(prefix="hanabi-backup-test-") as directory:
                    root = Path(directory) / "backup-test"
                    binaries = root / "bin"
                    backups = root / "backups"
                    binaries.mkdir(parents=True)
                    backups.mkdir()
                    shutil.copyfile(ROOT / "database_backup.sh", root / "database_backup.sh")
                    (root / ".env").write_text(
                        "DB_HOST=localhost\nDB_PORT=5432\nDB_USER=fixture\nDB_PASSWORD=fixture\n"
                        "DB_NAME=fixture\nGOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME=\n"
                    )
                    tools = {
                        "logger": "cat\n",
                        "uname": "echo Linux\n",
                        "date": "echo 1234\n",
                        "df": "printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\n"
                              f"fixture 20000000 1 {available} 91%% /\\n'\n",
                        "pg_dump": 'for file in "$PWD/backups/"*.sql; do\n'
                                   '  if [ -f "$file" ]; then exit 2; fi\n'
                                   'done\ncat "$PWD/payload"\n' + ("exit 1\n" if dump_fails else ""),
                    }
                    if gzip_fails:
                        tools["gzip"] = "exit 1\n"
                    for name, body in tools.items():
                        executable = binaries / name
                        executable.write_text("#!/bin/sh\n" + body)
                        executable.chmod(0o700)
                    payload = "".join(f"INSERT INTO example VALUES ({i});\n" for i in range(2000))
                    (root / "payload").write_text(payload)
                    previous = backups / "backup-test-1.sql.gz"
                    previous.write_text("previous completed backup")
                    (backups / "unrelated.txt").write_text("do not remove")
                    result = subprocess.run(
                        ["bash", "database_backup.sh"], cwd=root,
                        env=dict(os.environ, PATH=str(binaries) + os.pathsep + os.environ["PATH"]),
                        capture_output=True, timeout=10,
                    )
                    self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
                    self.assertFalse(any(path.suffix in (".partial", ".sql") for path in backups.iterdir()))
                    self.assertTrue((backups / "unrelated.txt").exists())
                    final = backups / "backup-test-1234.sql.gz"
                    if success:
                        self.assertFalse(previous.exists())
                        with gzip.open(final, "rt") as stream:
                            self.assertEqual(stream.read(), payload)
                    else:
                        self.assertFalse(final.exists())
                        self.assertTrue(previous.exists())
