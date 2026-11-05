#!/usr/bin/env python3
"""Generate or check SQLx metadata using a fresh, disposable local database."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import parse_qs, urlsplit, urlunsplit
import uuid

SQLX_VERSION = "0.9.0"
ROOT = Path(__file__).resolve().parents[2]
CRATE = Path(__file__).resolve().parent


def require_explicit_columns(query):
    if re.search(r"(?:\bSELECT|,)\s*(?:\w+\.)?\*\s*(?:,|\bFROM)", query, re.IGNORECASE):
        raise ValueError("SQLx checked queries must name columns explicitly, not SELECT *")


def database_urls(url):
    parsed = urlsplit(url)
    hosts = parse_qs(parsed.query).get("host", [parsed.hostname])
    if (
        parsed.scheme not in ("postgres", "postgresql")
        or parsed.hostname not in ("localhost", "127.0.0.1")
        or len(hosts) != 1
        or not (
            hosts[0] in ("localhost", "127.0.0.1")
            or (hosts[0] and hosts[0].startswith("/"))
        )
        or {"hostaddr", "service"} & parse_qs(parsed.query).keys()
    ):
        raise ValueError("HANABI_TEST_DATABASE_URL must identify disposable local PostgreSQL")
    name = f"hanabi_sqlx_{uuid.uuid4().hex}"
    return name, urlunsplit(parsed._replace(path=f"/{name}"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Regenerate committed metadata")
    args = parser.parse_args()
    admin = os.environ.get("HANABI_TEST_DATABASE_URL", "")
    name, database = database_urls(admin)
    version = subprocess.check_output(
        ["cargo", "sqlx", "--version"], cwd=CRATE, text=True
    ).strip()
    if version.split()[-1] != SQLX_VERSION:
        raise ValueError(f"Install sqlx-cli {SQLX_VERSION} before preparing metadata")
    env = os.environ.copy()
    # Never inherit a host-address override or use the application's .env.
    for key in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"):
        env.pop(key, None)
    env.update(PGCONNECT_TIMEOUT="5", DATABASE_URL=database, SQLX_OFFLINE="false")
    subprocess.run(
        ["createdb", "--maintenance-db", admin, name], env=env, check=True
    )
    try:
        migrations = sorted((ROOT / "install/migrations").glob("[0-9]*_*.sql"))
        version = max(int(path.name.split("_", 1)[0]) for path in migrations)
        subprocess.run(
            [
                "psql", "--no-psqlrc", "--quiet", "--dbname", database,
                "--set", "ON_ERROR_STOP=1", "--set", f"migration_version={version}",
                "--file", str(ROOT / "install/database_schema.sql"),
                "--file", str(ROOT / "install/schema_version.sql"),
            ],
            env=env,
            check=True,
        )
        command = ["cargo", "sqlx", "prepare", "--no-dotenv"]
        if not args.write:
            command.append("--check")
        subprocess.run(
            command + ["--", "--locked", "--all-targets"],
            cwd=CRATE,
            env=env,
            check=True,
        )
        for path in (CRATE / ".sqlx").glob("query-*.json"):
            require_explicit_columns(json.loads(path.read_text())["query"])
    finally:
        subprocess.run(
            ["dropdb", "--force", "--maintenance-db", admin, name],
            env=env,
            check=True,
        )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Command arguments may contain a password-bearing connection URL.
        print(
            str(error) if isinstance(error, ValueError) else
            "SQLx schema preparation failed; check the command output above.",
            file=sys.stderr,
        )
        sys.exit(1)
