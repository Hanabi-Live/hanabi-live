"""Deploy a release built from approved main to an already-running source-layout installation."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

import release
from release import GitHub, REPOSITORY


RESERVE_BYTES = 256 * 1024 * 1024
KEEP_DEPLOYMENTS = 5  # Replaced files from recent deployments are kept for manual rollback.
# The CI jobs that must pass before a revision is deployed. A matrix job is named "lint (rust)".
GATE_JOBS = ("client-build", "server-build", "lint", "test")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def command(root, *arguments):
    return subprocess.check_output(arguments, cwd=root, text=True).strip()


def matching_runs(runs, revision):
    return [
        run for run in runs
        if run["head_sha"] == revision
        and run["head_branch"] == "main"
        and run["event"] == "push"
        and run["path"] == ".github/workflows/ci.yml"
        and run["head_repository"]["full_name"] == REPOSITORY
    ]


def gate_jobs(github, run):
    """The jobs of the run that the deployment waits for."""
    jobs = []
    page = 1
    while True:
        response = github.json(
            f"/actions/runs/{run['id']}/attempts/{run['run_attempt']}/jobs?per_page=100&page={page}"
        )
        jobs.extend(job for job in response["jobs"]
                    if any(job["name"] == name or job["name"].startswith(f"{name} (")
                           for name in GATE_JOBS))
        if page * 100 >= response["total_count"]:
            break
        page += 1
    for job in jobs:
        require(job["run_id"] == run["id"] and job["run_attempt"] == run["run_attempt"]
                and job["head_sha"] == run["head_sha"],
                "A CI job belongs to a different run, attempt, or revision.")
    return jobs


def await_approved_run(github, revision):
    detail = (f"CI for main {revision}: "
              f"https://github.com/{REPOSITORY}/actions/workflows/ci.yml")
    last = None

    def timed_out(_signal_number, _frame):
        raise TimeoutError(f"CI wait timed out after 5 minutes; no deployment performed.\n{detail}")

    previous_handler = signal.signal(signal.SIGALRM, timed_out)
    # Bound stalled API requests as well as the polling sleeps.
    signal.setitimer(signal.ITIMER_REAL, 300)
    try:
        while True:
            runs = github.json(
                f"/actions/workflows/ci.yml/runs?event=push&branch=main&head_sha={revision}&per_page=100"
            )["workflow_runs"]
            matches = matching_runs(runs, revision)
            if matches:
                run = max(matches, key=lambda run: run["id"])
                detail = (f"CI for main {revision}: https://github.com/{REPOSITORY}"
                          f"/actions/runs/{run['id']}/attempts/{run['run_attempt']}")
                jobs = gate_jobs(github, run)
                for job in jobs:
                    detail += f"\n{job['name']}: {job['conclusion'] or job['status']}"
                failed = [job["name"] for job in jobs
                          if job["status"] == "completed" and job["conclusion"] != "success"]
                require(not failed, f"CI checks failed; no deployment performed.\n{detail}")
                missing = [name for name in GATE_JOBS
                           if not any(job["name"] == name or job["name"].startswith(f"{name} (")
                                      for job in jobs)]
                if not missing and all(job["status"] == "completed" for job in jobs):
                    return run
                require(run["status"] != "completed",
                        f"CI finished without the jobs: {', '.join(missing)}\n{detail}")
            else:
                detail = (f"No CI run found for main {revision}; no older release was selected. Check "
                          f"https://github.com/{REPOSITORY}/actions/workflows/ci.yml")
            if detail != last:
                print(f"Waiting for CI (5-minute limit).\n{detail}", flush=True)
                last = detail
            time.sleep(5)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)


def stage_upload(archive, revision, work):
    """Verifies the uploaded release of the revision and stages it."""
    name = f"hanabi-live-{revision}-linux-amd64.tar.gz"
    require(archive.name == name, f"The uploaded release is not for main {revision}: {archive.name}")
    checksum = archive.with_name(name + ".sha256").read_text().split()
    require(len(checksum) == 2 and re.fullmatch(r"[a-f0-9]{64}", checksum[0])
            and checksum[1] == name, "Invalid release checksum file.")
    require(shutil.disk_usage(work).free > archive.stat().st_size * 4 + RESERVE_BYTES,
            "Insufficient disk headroom for staging and backups.")
    store = work / "staging"
    release.init_root(str(store))
    release.stage(store, archive, checksum[0])
    staged = store / "releases" / revision
    metadata = release.verify(staged)
    require(metadata["revision"] == revision
            and metadata.get("dirty") is False, "Release identity or clean-build provenance differs.")
    return staged, metadata


def control(port, path, method="GET"):
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode()
    except urllib.error.HTTPError as error:
        with error:
            detail = error.read(8192).decode(errors="replace").strip()
        raise urllib.error.URLError(
            f"Control request {path} returned HTTP {error.code}: {detail or error.reason}"
        ) from error
    return json.loads(text) if path == "/metrics" else text.strip()


def healthy(metrics):
    recovery = metrics["recovery"]
    return (
        metrics["draining"] is False
        and recovery["storageInitialized"] is True
        and recovery["stateHealthy"] is True
        and recovery["pendingTransactions"] == 0
    )


def runtime_files(metadata):
    prefixes = ("public/", "misc/", "server/src/views/", "packages/game/src/json/",
                "packages/data/src/json/")
    names = [name for name in metadata["files"]
             if name == "hanabi-live" or name.startswith(prefixes)]
    versions = ["public/js/bundles/git_revision.txt", "public/js/bundles/version.txt"]
    supporting = sorted(name for name in names if name not in versions
                        and name != "hanabi-live" and not name.endswith(".html"))
    html = sorted(name for name in names if name.endswith(".html"))
    return supporting + ["hanabi-live"] + html + versions


def safe_target(root, name):
    require(release.safe_name(name), f"Unsafe publication path: {name}")
    target = root / name
    require(target.resolve().is_relative_to(root), f"Publication path escapes installation: {name}")
    require(not target.is_symlink(), f"Publication target is a symlink: {name}")
    return target


def backup(root, staged, metadata, work):
    names = runtime_files(metadata)
    required = RESERVE_BYTES
    for name in names:
        target = safe_target(root, name)
        required += (staged / name).stat().st_size
        if target.exists():
            required += target.stat().st_size
    require(shutil.disk_usage(root).free > required, "Insufficient disk headroom for publication.")
    destination = work / "previous"
    destination.mkdir()
    for name in names:
        target = safe_target(root, name)
        if target.exists():
            saved = destination / name
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
            with saved.open("rb") as stream:
                os.fsync(stream.fileno())
    return destination


def publish(root, staged, metadata):
    for name in runtime_files(metadata):
        source = staged / name
        require(release.digest(source) == metadata["files"][name], f"Staged file changed: {name}")
    for name in runtime_files(metadata):
        target = safe_target(root, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
        os.close(descriptor)
        temporary = Path(temporary)
        try:
            shutil.copy2(staged / name, temporary)
            with temporary.open("rb") as stream:
                os.fsync(stream.fileno())
            os.replace(temporary, target)
            release.sync_directory(target.parent)
        finally:
            temporary.unlink(missing_ok=True)


def prune(backups):
    """Keep records of finished deployments, but only recent replaced files and no staged releases.

    Deployments that failed after changing production are evidence, so they are left as they are.
    One that stopped while staging changed nothing, so only its record is kept.
    """
    try:
        finished = []
        for work in backups.glob("deploy-*"):
            journal = work / "deployment.json"
            try:
                phase = json.loads(journal.read_text()).get("phase")
                if phase in ("verified", "checked", "staging"):
                    finished.append((journal.stat().st_mtime, work, phase))
            except (OSError, ValueError):
                continue
        # Checks replace no files, so only deployments count toward the rollback limit.
        rollbacks = 0
        for _, work, phase in sorted(finished, reverse=True):
            kept = {"deployment.json"}
            if phase == "verified" and rollbacks < KEEP_DEPLOYMENTS:
                kept.add("previous")
                rollbacks += 1
            for path in work.iterdir():
                if path.name in kept:
                    continue
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                else:
                    path.unlink()
    except OSError as error:
        print(f"Warning: could not remove old deployment files: {error}", file=sys.stderr)


def prepare(root, staged):
    shared = staged.parent.parent / "shared"
    (shared / ".env").symlink_to(root / ".env")
    if (root / "letsencrypt").exists():
        (shared / "letsencrypt").rmdir()
        (shared / "letsencrypt").symlink_to(root / "letsencrypt", target_is_directory=True)
    subprocess.run([str(staged / "hanabi-live"), "--check-startup"], cwd=staged, check=True)
    # The status command refuses a database newer than the release.
    status = subprocess.run([str(staged / "hanabi-live"), "migrate", "status"],
                            check=True, capture_output=True, text=True).stdout
    print(status, end="", flush=True)
    return any(line.startswith("Pending: ") for line in status.splitlines())


def await_restart(port, revision, timeout=180):
    deadline = time.monotonic() + timeout
    last = "Waiting for the replacement server"
    while time.monotonic() < deadline:
        try:
            serving = control(port, "/version")
            if serving == revision and healthy(control(port, "/metrics")):
                return
            detail = f"Serving {serving}; target revision and healthy recovery are required"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            detail = f"Waiting for restart: {error}"
        if detail != last:
            print(detail, flush=True)
            last = detail
        time.sleep(2)
    raise ValueError(f"Restart was not verified within {timeout} seconds. {last}")


def deploy(root, archive, check, apply_migrations):
    require(not (root / "release.json").exists(),
            "This script is for the running source-layout installation, not the opt-in release store.")
    require((root / ".env").is_file(), "Missing production .env.")
    require(not command(root, "git", "status", "--porcelain"), "Source checkout is dirty; preserve and resolve changes first.")
    port = int(command(root, "bash", "-c", 'set -e; source .env; printf "%s" "${LOCALHOST_PORT:-8081}"'))
    require(1 <= port <= 65535, "Invalid control port.")
    running = control(port, "/version")
    require(re.fullmatch(r"[a-f0-9]{40}", running), "Running server did not identify a Rust revision.")
    require(command(root, str(root / "hanabi-live"), "--version") == running,
            "Installed and running binaries differ. Investigate the unfinished deployment first.")
    require((root / "public/js/bundles/git_revision.txt").read_text().strip() == running,
            "Installed client and running server revisions differ. Investigate the unfinished deployment first.")
    installed_version = (root / "public/js/bundles/version.txt").read_text().strip()
    require(installed_version == running, "Installed client version does not match the running revision.")
    require(healthy(control(port, "/metrics")), "Recovery is unhealthy, frozen, or draining; refusing deployment.")
    github = GitHub()
    revision = github.json("/commits/main")["sha"]
    require(re.fullmatch(r"[a-f0-9]{40}", revision), "Invalid main revision.")
    run = await_approved_run(github, revision)
    print(f"Approved main revision {revision}, CI run {run['id']}", flush=True)
    if running == revision:
        print("Already serving the approved revision with healthy recovery.")
        return
    command(root, "git", "fetch", "--quiet", "origin", revision)
    subprocess.run(["git", "merge-base", "--is-ancestor", "HEAD", revision], cwd=root, check=True)
    subprocess.run(["git", "merge-base", "--is-ancestor", running, revision], cwd=root, check=True)
    backups = root / "backups"
    backups.mkdir(exist_ok=True)
    with (backups / ".deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        work = Path(tempfile.mkdtemp(prefix="deploy-", dir=backups))
        print(f"Deployment records and file backups: {work}", flush=True)
        journal = work / "deployment.json"
        record = {"previous": running, "revision": revision, "run": run["id"], "phase": "staging"}

        def save():
            journal.write_text(json.dumps(record, indent=2) + "\n")

        def phase(value):
            record["phase"] = value
            save()
            print(value, flush=True)

        # Record the deployment before staging, so that pruning can find a failed one.
        save()

        try:
            staged, metadata = stage_upload(archive, revision, work)
            pending = prepare(root, staged)
            if check:
                print(f"Preflight passed; pending migrations: {pending}. No deployment or restart performed.")
                phase("checked")
                prune(backups)
                return
            require(not pending or apply_migrations,
                    "Pending migrations require review and --apply-migrations. No live files were changed.")
            require(control(port, "/version") == running and healthy(control(port, "/metrics")),
                    "Server state changed during staging; refusing publication.")
            record["checkout"] = command(root, "git", "rev-parse", "HEAD")
            backup(root, staged, metadata, work)
            phase("backed-up")
            if pending:
                phase("migrating")
                subprocess.run([str(staged / "hanabi-live"), "migrate", "apply"], check=True)
            phase("publishing")
            # The release holds the built files; post-merge dependency/build hooks must not run here.
            subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "merge", "--ff-only", revision],
                           cwd=root, check=True)
            publish(root, staged, metadata)
            subprocess.run([str(root / "hanabi-live"), "--check-startup"], cwd=root, check=True)
            phase("restarting")
            require(control(port, "/gracefulRestart", "POST") == "success", "Restart request was not acknowledged.")
            await_restart(port, revision)
            for name in runtime_files(metadata):
                require(release.digest(root / name) == metadata["files"][name], f"Published file differs: {name}")
            phase("verified")
            print(f"Deployed {revision}; running revision, paired files, and recovery health verified.")
            print("Review fresh server logs.")
            prune(backups)
        except (OSError, ValueError, KeyError, subprocess.SubprocessError):
            print(f"Deployment stopped in phase {record['phase']}. Preserve {work}; "
                  "no automatic rollback, forced restart, or state deletion was attempted.", file=sys.stderr)
            raise


def main():
    require(sys.version_info >= (3, 12), "Python 3.12+ is required.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True,
                        help="The release of main, with its .sha256 file beside it")
    parser.add_argument("--check", action="store_true", help="Stage and verify without publication or restart")
    parser.add_argument("--apply-migrations", action="store_true", help="Approve pending forward migrations")
    args = parser.parse_args()
    os.umask(0o077)
    deploy(Path.cwd().resolve(), args.archive.resolve(), args.check, args.apply_migrations)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        sys.exit(f"Deployment refused: {error}")
