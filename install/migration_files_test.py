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
    def check_files(self, files, baseline="6\n"):
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
            ([], 6),
            (["008_second.sql", "007_first.sql"], 8),
            (["unversioned.sql"], None),
            (["000_zero.sql"], None),
            (["006_retired.sql"], None),
            (["007_first.sql", "009_gap.sql"], None),
            (["007_first.sql", "0007_duplicate.sql"], None),
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
            "007_probe.sql": "SELECT 1;\n---- create above / drop below ----\nSELECT 2;\n",
        })
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Down migrations", result.stderr)

    def test_invalid_baselines_are_rejected(self):
        for baseline in (None, "", "-1\n", "6\n7\n", "06\n", "1000000000\n"):
            with self.subTest(baseline=baseline):
                self.assertNotEqual(self.check_files({}, baseline).returncode, 0)

    @unittest.skipUnless(os.environ.get("HANABI_TEST_DATABASE_URL"), "Requires disposable PostgreSQL")
    def test_pruned_history_upgrades_without_resetting_versions_or_discarding_checkpoints(self):
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
        self.assertIn("Upgrade to schema baseline 6 with an earlier release first", guard.stderr)
        run("apply", False)
        sql("CREATE TABLE schema_version(version integer PRIMARY KEY); "
            "INSERT INTO schema_version VALUES(6); "
            "CREATE TABLE active_games(game_id integer PRIMARY KEY, "
            "revision bigint NOT NULL CHECK(revision > 0), checkpoint text NOT NULL); "
            "INSERT INTO active_games VALUES(1, 1, 'pending checkpoint')")
        run("status", True)
        run("apply", False)
        self.assertEqual(sql("SELECT version FROM schema_version"), "6")
        self.assertEqual(sql("SELECT checkpoint FROM active_games"), "pending checkpoint")
        sql("DELETE FROM active_games WHERE game_id=1")
        run("apply", True)
        run("apply", True)
        self.assertEqual(sql("SELECT version FROM schema_version"), "7")
        self.assertEqual(sql("SELECT to_regclass('public.active_games') IS NULL"), "t")
        for version in (5, 8):
            sql(f"UPDATE schema_version SET version={version}")
            for command in ("status", "apply"):
                self.assertIn("refusing", run(command, False).stderr)
            self.assertEqual(sql("SELECT version FROM schema_version"), str(version))
        sql("TRUNCATE schema_version; INSERT INTO schema_version VALUES(6),(7)")
        run("apply", False)
        sql("TRUNCATE schema_version")
        run("apply", False)
        sql("INSERT INTO schema_version VALUES(6)")
        (install / "migrations/007_retire_active_games.sql").unlink()
        run("status", True)
        run("apply", True)
        self.assertEqual(sql("SELECT version FROM schema_version"), "6")
        sql("DROP TABLE schema_version")
        shutil.copyfile(
            source / "migrations/007_retire_active_games.sql",
            install / "migrations/007_retire_active_games.sql",
        )
        subprocess.run(
            ["bash", str(install / "install-database-schema.sh")],
            check=True, capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(sql("SELECT version FROM schema_version"), "7")
        self.assertEqual(sql("SELECT to_regclass('public.active_games') IS NULL"), "t")
        run("apply", True)
