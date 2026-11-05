import os
import subprocess
import unittest
from unittest.mock import patch
from urllib.parse import urlencode, urlsplit

import sqlx_schema


class SchemaPreparationTests(unittest.TestCase):
    def test_only_local_connections_are_accepted(self):
        for url in (
            "",
            "postgres://database.example/postgres",
            "postgres://127.0.0.1/postgres?host=database.example",
            "postgres://127.0.0.1/postgres?host=localhost&host=database.example",
            "postgres://127.0.0.1/postgres?hostaddr=192.0.2.1",
            "postgres://127.0.0.1/postgres?service=production",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                sqlx_schema.database_urls(url)

    def test_schema_targets_a_new_database_and_preserves_local_socket(self):
        url = "postgres://fixture@localhost:55439/postgres?" + urlencode({"host": "/tmp/pg"})
        name, target = sqlx_schema.database_urls(url)
        self.assertNotEqual(name, "postgres")
        self.assertEqual(urlsplit(target).path, f"/{name}")
        self.assertEqual(urlsplit(target).query, urlsplit(url).query)
        self.assertNotEqual(sqlx_schema.database_urls(url)[0], name)

    def test_failed_preparation_still_drops_only_the_created_database(self):
        commands = []

        def run(command, **kwargs):
            commands.append(command)
            if command[0] == "cargo":
                raise subprocess.CalledProcessError(1, command)

        with (
            patch.dict(os.environ, {"HANABI_TEST_DATABASE_URL": "postgres://localhost/postgres"}),
            patch("sys.argv", ["sqlx_schema.py"]),
            patch("subprocess.check_output", return_value="sqlx-cli-sqlx 0.9.0"),
            patch("subprocess.run", side_effect=run),
            self.assertRaises(subprocess.CalledProcessError),
        ):
            sqlx_schema.main()
        self.assertEqual(commands[0][0], "createdb")
        self.assertEqual(commands[-1][0], "dropdb")
        self.assertEqual(commands[0][-1], commands[-1][-1])
        self.assertNotEqual(commands[-1][-1], "postgres")


if __name__ == "__main__":
    unittest.main()
