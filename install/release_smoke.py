#!/usr/bin/env python3
"""Exercise a real release with an isolated database; never use a production DSN."""

import json
import contextlib
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import release


def wait_for(check, process):
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Server exited unexpectedly: {process.returncode}")
        try:
            if check():
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.1)
    raise RuntimeError("Server readiness timed out")


def port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def database_environment(dsn):
    if dsn.startswith(("postgres://", "postgresql://")):
        parsed = urllib.parse.urlsplit(dsn)
        return {
            "DB_HOST": parsed.hostname or "localhost",
            "DB_PORT": str(parsed.port or 5432),
            "DB_USER": urllib.parse.unquote(parsed.username or "postgres"),
            "DB_PASSWORD": urllib.parse.unquote(parsed.password or ""),
        }
    values = dict(item.split("=", 1) for item in shlex.split(dsn))
    return {
        "DB_HOST": values.get("host", "localhost"),
        "DB_PORT": values.get("port", "5432"),
        "DB_USER": values.get("user", "postgres"),
        "DB_PASSWORD": values.get("password", ""),
    }

@contextlib.contextmanager
def redis_fixture():
    with tempfile.TemporaryDirectory(prefix="hanabi-release-redis-") as directory:
        socket_path = Path(directory) / "redis.sock"
        environment = {key: os.environ[key] for key in ("PATH", "LD_LIBRARY_PATH") if key in os.environ}
        process = subprocess.Popen(
            ["redis-server", "--port", "0", "--unixsocket", str(socket_path), "--unixsocketperm", "700",
             "--dir", directory, "--appendonly", "yes", "--appendfsync", "always", "--save", "",
             "--logfile", str(Path(directory) / "redis.log")],
            env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            wait_for(lambda: subprocess.run(
                ["redis-cli", "-s", str(socket_path), "PING"], env=environment,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2,
            ).returncode == 0, process)
            yield f"redis+unix://{socket_path}"
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
                raise


def main():
    archive = Path(sys.argv[1]).resolve()
    if len(sys.argv) > 2 and sys.argv[2] != "rust":
        raise ValueError("Only Rust releases are supported")
    with redis_fixture() as redis_url:
        exercise(archive, redis_url)


def exercise(archive, redis_url):
    dsn = os.environ["HANABI_TEST_DATABASE_URL"]
    database = "hanabi_release_" + uuid.uuid4().hex
    workspace = Path("dist/release-smoke", database).resolve()
    workspace.mkdir(parents=True)
    root = workspace / "deployment"
    process = None
    created = False
    success = False
    environment = database_environment(dsn)
    public_port, local_port = port(), port()
    while public_port == local_port:
        local_port = port()
    environment.update(
        DB_NAME=database,
        DOMAIN="localhost",
        SESSION_SECRET="release-smoke-only" * 12,
        PORT=str(public_port),
        LOCALHOST_PORT=str(local_port),
    )
    environment["REDIS_URL"] = redis_url
    pg_environment = dict(
        os.environ,
        PGHOST=environment["DB_HOST"],
        PGPORT=environment["DB_PORT"],
        PGUSER=environment["DB_USER"],
        PGPASSWORD=environment["DB_PASSWORD"],
        PGDATABASE=database,
    )
    try:
        subprocess.run(["createdb", "--maintenance-db", dsn, database], check=True)
        created = True
        subprocess.run(
            ["psql", "-Xq", "-v", "ON_ERROR_STOP=1", "-f", "install/database_schema.sql"],
            env=pg_environment,
            check=True,
        )
        # Exercise all tracked forward migrations against the pre-recovery schema.
        subprocess.run(
            [
                "psql",
                "-Xq",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                "DROP TABLE game_custom_decks; ALTER TABLE users ADD COLUMN old_password_hash TEXT",
            ],
            env=pg_environment,
            check=True,
        )
        release.init_root(str(root))
        release.stage(root, archive, release.digest(archive))
        installed = next((root / "releases").iterdir())
        revision = release.verify(installed)["revision"]

        def write_env(db_name):
            values = dict(environment, DB_NAME=db_name)
            (root / "shared/.env").write_text(
                "".join(f"{key}={shlex.quote(value)}\n" for key, value in values.items())
            )

        write_env(database + "_missing")
        try:
            release.activate(root, revision)
        except subprocess.CalledProcessError:
            pass
        else:
            raise AssertionError("A failed migration activated code")
        assert not (root / "current").exists()
        write_env(database)
        release.activate(root, revision)
        subprocess.run(
            ["psql", "-Xq", "-v", "ON_ERROR_STOP=1", "-c", "UPDATE schema_version SET version = 999"],
            env=pg_environment,
            check=True,
        )
        ahead = subprocess.run(["bash", str(installed / "install/migrate.sh"), "apply"])
        assert ahead.returncode != 0, "A release attempted to downgrade a newer database"
        version = subprocess.check_output(
            ["psql", "-XAt", "-c", "SELECT version FROM schema_version"], env=pg_environment, text=True
        ).strip()
        assert version == "999"
        target = len(list((installed / "install/migrations").glob("*.sql")))
        subprocess.run(
            ["psql", "-Xq", "-v", "ON_ERROR_STOP=1", "-c", f"UPDATE schema_version SET version = {target}"],
            env=pg_environment,
            check=True,
        )
        log_path = workspace / "server.log"
        with log_path.open("w") as log:
            process = subprocess.Popen(
                [str(root / "current/hanabi-live")],
                stdout=log,
                stderr=log,
                env={"PATH": os.environ["PATH"]},
            )
            base_url = f"http://127.0.0.1:{local_port}"

            def request(path):
                with urllib.request.urlopen(base_url + path, timeout=2) as response:
                    return response.read().decode()

            wait_for(lambda: request("/version").strip() == revision, process)
            assert "Error reading file:" not in log_path.read_text()
            assert "chatMapAddSimpleResponses: Error" not in log_path.read_text()
            metrics = json.loads(request("/metrics"))
            assert metrics["recovery"]["storageInitialized"]
            assert metrics["recovery"]["database"]["maxConnections"] == 2
            with urllib.request.urlopen(
                f"http://127.0.0.1:{public_port}/public/js/bundles/version.txt", timeout=2
            ) as response:
                assert response.read().decode().strip() == release.verify(installed)["clientVersion"]
            try:
                release.activate(root, revision)
            except BlockingIOError:
                pass
            else:
                raise AssertionError("Activation was allowed while the server was running")
            request("/gracefulRestart")
            wait_for(
                lambda: log_path.read_text().count(
                    "The server has successfully started"
                ) >= 2
                and request("/version").strip() == revision,
                process,
            )
            # The inherited lock must remain exclusive through re-exec.
            try:
                with release.locked(root):
                    raise AssertionError("Restart lost the shared lifecycle lock")
            except BlockingIOError:
                pass
            request("/gracefulStop")
            assert process.wait(timeout=20) == 0
            try:
                release.activate(root, revision)
            except ValueError as error:
                assert "Rollback/re-activation refused" in str(error)
            else:
                raise AssertionError("Rollback guard was bypassed")
            process = subprocess.Popen(
                [str(root / "current/hanabi-live")],
                stdout=log,
                stderr=log,
                env={"PATH": os.environ["PATH"]},
            )
            wait_for(lambda: request("/version").strip() == revision, process)
            process.terminate()
            assert process.wait(timeout=20) == 0
        success = True
        print("Release smoke passed: migrate, activate, serve paired assets, restart, shutdown, SIGTERM, and rejection guards.")
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait(timeout=40)
        if created:
            subprocess.run(["dropdb", "--force", "--maintenance-db", dsn, database], check=True)
        if success:
            shutil.rmtree(workspace)
        else:
            print(f"Failure evidence retained in {workspace}", file=sys.stderr)


if __name__ == "__main__":
    main()
