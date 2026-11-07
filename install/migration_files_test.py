from pathlib import Path
import os
import shlex
import shutil
import subprocess
import tempfile
import unittest
from urllib.parse import parse_qs, urlsplit
import uuid


class MigrationFilesTest(unittest.TestCase):
    def check_files(self, files, baseline="7\n"):
        with tempfile.TemporaryDirectory(prefix="hanabi-migration-files-") as directory:
            if baseline is not None:
                (Path(directory) / "baseline.txt").write_text(baseline)
            for name, contents in files.items():
                (Path(directory) / name).write_text(contents)
            return subprocess.run(
                ["bash", "-c", 'source "$1"; get_migration_version "$2"', "--",
                 str(Path(__file__).with_name("migration-files.sh")), directory],
                capture_output=True, text=True, timeout=10,
            )

    def test_consecutive_versions(self):
        for files, version in [
            ([], 7),
            (["009_second.sql", "008_first.sql"], 9),
            (["unversioned.sql"], None),
            (["000_zero.sql"], None),
            (["007_retired.sql"], None),
            (["008_first.sql", "010_gap.sql"], None),
            (["008_first.sql", "0008_duplicate.sql"], None),
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
            "008_probe.sql": "SELECT 1;\n---- create above / drop below ----\nSELECT 2;\n",
        })
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Down migrations", result.stderr)

    def test_invalid_baselines_are_rejected(self):
        for baseline in (None, "", "-1\n", "6\n7\n", "06\n", "1000000000\n"):
            with self.subTest(baseline=baseline):
                self.assertNotEqual(self.check_files({}, baseline).returncode, 0)

    @unittest.skipUnless(os.environ.get("HANABI_TEST_DATABASE_URL"), "Requires disposable PostgreSQL")
    def test_pruned_history_supports_baseline_and_future_migrations(self):
        dsn = os.environ["HANABI_TEST_DATABASE_URL"]
        parsed = urlsplit(dsn)
        self.assertIn(parsed.scheme, ("postgres", "postgresql"))
        self.assertIn(parsed.hostname, ("127.0.0.1", "localhost"))
        self.assertFalse({"host", "hostaddr", "service"} & parse_qs(parsed.query).keys())
        from release_smoke import database_environment

        temporary = tempfile.TemporaryDirectory(prefix="hanabi-migration-runner-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        source = Path(__file__).resolve().parent
        install = root / "install"
        install.mkdir()
        for name in ("migrate.sh", "migration-files.sh", "install-database-schema.sh",
                     "database_schema.sql", "schema_version.sql"):
            shutil.copyfile(source / name, install / name)
        shutil.copytree(source / "migrations", install / "migrations")
        (root / "server").mkdir()
        (root / "server/Cargo.toml").touch()
        database = "hanabi_migrations_" + uuid.uuid4().hex
        values = dict(database_environment(dsn), DB_NAME=database)
        (root / ".env").write_text(
            "".join(f"{key}={shlex.quote(value)}\n" for key, value in values.items())
        )
        environment = dict(
            os.environ, PGHOST=values["DB_HOST"], PGPORT=values["DB_PORT"],
            PGUSER=values["DB_USER"], PGPASSWORD=values["DB_PASSWORD"], PGDATABASE=database,
        )
        subprocess.run(["createdb", "--maintenance-db", dsn, database], check=True, timeout=10)
        self.addCleanup(
            subprocess.run, ["dropdb", "--force", "--maintenance-db", dsn, database],
            check=True, timeout=10,
        )

        def sql(statement):
            return subprocess.check_output(
                ["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
                env=environment, text=True, timeout=10,
            ).strip()

        def run(command, success):
            result = subprocess.run(
                ["bash", str(install / "migrate.sh"), command],
                capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
            return result

        prepared = root / "prepared"
        prepared.mkdir()
        subprocess.run(
            ["bash", "-c", 'source "$1"; prepare_tern_migrations "$2" "$3"', "--",
             str(install / "migration-files.sh"), str(install / "migrations"), str(prepared)],
            check=True, timeout=10,
        )
        guard = subprocess.run(
            ["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-f", str(prepared / "001_baseline.sql")],
            env=environment, capture_output=True, text=True, timeout=10,
        )
        self.assertNotEqual(guard.returncode, 0)
        self.assertIn("Upgrade to schema baseline 7 with an earlier release first", guard.stderr)
        run("apply", False)
        sql("CREATE TABLE schema_version(version integer PRIMARY KEY); "
            "INSERT INTO schema_version VALUES(7)")
        run("status", True)
        run("apply", True)
        run("apply", True)
        self.assertEqual(sql("SELECT version FROM schema_version"), "7")
        for version in (6, 8):
            sql(f"UPDATE schema_version SET version={version}")
            for command in ("status", "apply"):
                self.assertIn("refusing", run(command, False).stderr)
            self.assertEqual(sql("SELECT version FROM schema_version"), str(version))
        sql("TRUNCATE schema_version; INSERT INTO schema_version VALUES(7),(8)")
        run("apply", False)
        sql("TRUNCATE schema_version")
        run("apply", False)
        sql("INSERT INTO schema_version VALUES(7)")
        migration = install / "migrations/008_probe.sql"
        migration.write_text("CREATE TABLE migration_probe(id integer PRIMARY KEY);\n")
        run("status", True)
        run("apply", True)
        run("apply", True)
        self.assertEqual(sql("SELECT version FROM schema_version"), "8")
        self.assertEqual(sql("SELECT to_regclass('public.migration_probe') IS NOT NULL"), "t")
        sql("DROP TABLE schema_version, migration_probe")
        migration.unlink()
        subprocess.run(
            ["bash", str(install / "install-database-schema.sh")],
            check=True, capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(sql("SELECT version FROM schema_version"), "7")
        run("apply", True)
