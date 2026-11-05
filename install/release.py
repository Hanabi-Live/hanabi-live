#!/usr/bin/env python3
"""Build verification and stopped-service installation of native releases."""

import argparse
import contextlib
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile


RUNTIME_LINKS = {
    ".env": ".env",
    "logs": "logs",
    "ongoing_tables": "ongoing_tables",
    "motd.txt": "motd.txt",
    "letsencrypt": "letsencrypt",
    ".lifecycle.lock": ".lifecycle.lock",
    ".go-to-rust-cutover": ".go-to-rust-cutover",
}


class ReleaseStateUncertainError(RuntimeError):
    """A rename succeeded, but its directory durability could not be confirmed."""


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(filename):
    with open(filename, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def safe_name(name):
    return (
        isinstance(name, str)
        and name not in ("", ".", "..")
        and not name.startswith("/")
        and all(part not in ("", ".", "..") for part in name.split("/"))
        and "\\" not in name
    )


def sensitive_path(name):
    return any(
        part == ".git" or part == ".env" or part.startswith(".env.")
        or part in ("logs", "ongoing_tables", "GitHub_private_key.pem")
        for part in name.split("/")
    )


def files_in(directory):
    result = {}
    for path in sorted(directory.rglob("*")):
        name = path.relative_to(directory).as_posix()
        if name in RUNTIME_LINKS or name == "release.json":
            continue
        require(not sensitive_path(name), f"Runtime/private file in immutable assets: {name}")
        require(not path.is_symlink(), f"Symlink in immutable assets: {name}")
        if path.is_file():
            result[name] = digest(path)
    return result


def manifest(directory, runtime="go"):
    require(runtime in ("go", "rust"), "Unsupported runtime")
    revision = git("rev-parse", "HEAD")
    metadata = {
        "format": 1,
        "runtime": runtime,
        "platform": "linux-amd64",
        "revision": revision,
        "clientVersion": (directory / "public/js/bundles/version.txt").read_text().strip(),
        "commitCount": int(git("rev-list", "--count", "HEAD")),
        "dirty": bool(git("status", "--porcelain", "--untracked-files=normal")),
        "workflowRun": (
            f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/"
            f"{os.environ['GITHUB_RUN_ID']}/attempts/{os.environ['GITHUB_RUN_ATTEMPT']}"
            if os.environ.get("GITHUB_ACTIONS") == "true"
            else "local-untrusted"
        ),
        "goVersion": subprocess.check_output(["go", "version"], text=True).strip(),
        "nodeVersion": subprocess.check_output(["node", "--version"], text=True).strip(),
        "files": files_in(directory),
    }
    if runtime == "rust":
        metadata["rustTarget"] = "x86_64-unknown-linux-musl"
        metadata["rustVersion"] = subprocess.check_output(
            ["rustc", "--version"], cwd="experimental/rust-server", text=True
        ).strip()
    require(
        os.environ.get("GITHUB_ACTIONS") != "true" or not metadata["dirty"],
        "CI build modified the source checkout",
    )
    (directory / "release.json").write_text(json.dumps(metadata, indent=2) + "\n")


def verify(directory):
    require(not directory.is_symlink(), "Release directory cannot be a symlink")
    metadata_path = directory / "release.json"
    require(not metadata_path.is_symlink(), "Manifest cannot be a symlink")
    metadata = json.loads(metadata_path.read_text())
    require(isinstance(metadata, dict), "Invalid release metadata")
    revision = metadata.get("revision", "")
    require(metadata.get("format") == 1, "Unsupported release format")
    require(metadata.get("platform") == "linux-amd64", "Unsupported platform")
    runtime = metadata.get("runtime", "go")
    require(runtime in ("go", "rust"), "Unsupported runtime")
    require(re.fullmatch(r"[a-f0-9]{40}", revision), "Invalid revision")
    require(
        isinstance(metadata.get("commitCount"), int)
        and str(metadata["commitCount"]) == metadata.get("clientVersion"),
        "Invalid client cache version",
    )
    expected = metadata["files"]
    require(
        isinstance(expected, dict)
        and all(
            safe_name(name) and isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value)
            for name, value in expected.items()
        ),
        "Unsafe manifest path or checksum",
    )
    require(files_in(directory) == expected, "Release file checksums or file set differ")
    for name in (
        "hanabi-live",
        "install/tern",
        "install/migrate.sh",
        "install/migration_files.sh",
        "public/js/bundles/version.txt",
        "public/js/bundles/git_revision.txt",
        f"public/js/bundles/main.{metadata['clientVersion']}.min.js",
        f"public/css/main.{metadata['clientVersion']}.min.css",
    ):
        require(name in expected, f"Missing required file: {name}")
    # Previously published immutable releases retain the old asset layout.
    require(
        "packages/data/src/json/chatReplyCommands.json" in expected
        or "packages/server/src/json/chatReplyCommands.json" in expected,
        "Missing required file: packages/data/src/json/chatReplyCommands.json",
    )
    for name, value in (("git_revision.txt", revision), ("version.txt", metadata["clientVersion"])):
        require(
            (directory / "public/js/bundles" / name).read_text().strip() == value,
            f"Client/server mismatch: {name}",
        )
    require(
        subprocess.check_output(
            [str(directory / "hanabi-live"), "--version" if runtime == "rust" else "--build-revision"],
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        ).strip() == revision,
        "Compiled server revision does not match manifest",
    )
    return metadata


def deployment_root(value):
    root = Path(value)
    require(root.is_absolute(), "Deployment root must be absolute")
    require(root == root.resolve(), "Deployment root must be canonical, without symlinks")
    require(root.parent != root and root.name not in ("", ".", ".."), "Unsafe deployment root")
    require((root / ".hanabi-releases").is_file(), "Run init on a NEW dedicated deployment root first")
    for name in ("shared", "releases"):
        require((root / name).is_dir() and not (root / name).is_symlink(), f"Invalid {name} directory")
    return root


def sync_directory(directory):
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


@contextlib.contextmanager
def locked(root):
    lock = root / "shared/.lifecycle.lock"
    require(lock.is_file() and not lock.is_symlink(), "Invalid lifecycle lock")
    with lock.open("r+") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def init_root(value):
    root = Path(value)
    require(root.is_absolute() and root == root.resolve(), "Use a canonical absolute deployment path")
    require(not root.exists(), "Deployment root must not already exist")
    root.mkdir(mode=0o750)
    (root / ".hanabi-releases").touch()
    (root / "releases").mkdir()
    (root / "shared").mkdir(mode=0o750)
    for name in ("logs", "ongoing_tables", "letsencrypt"):
        (root / "shared" / name).mkdir(mode=0o750)
    (root / "shared/.lifecycle.lock").touch(mode=0o600)
    print(f"Initialized {root}; provision shared/.env and retained runtime state while the OLD service is stopped.")


def stage(root, archive, checksum):
    require(re.fullmatch(r"[a-f0-9]{64}", checksum), "Supply the trusted CI archive SHA-256")
    # Extract the exact bytes verified, even if the download path is replaced.
    archive_bytes = archive.read_bytes()
    require(hashlib.sha256(archive_bytes).hexdigest() == checksum, "Archive SHA-256 mismatch")
    with locked(root):
        staging = root / "releases/.staging"
        require(not staging.exists(), "Staging directory already exists; investigate the interrupted install")
        staging.mkdir()
        try:
            with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as stream:
                members = stream.getmembers()
                seen = set()
                for member in members:
                    name = member.name.removeprefix("./").rstrip("/")
                    if name in ("", ".") and member.isdir():
                        continue
                    require(safe_name(name) and name not in seen, "Unsafe or duplicate archive path")
                    require(member.isfile() or member.isdir(), "Archive links and special files are forbidden")
                    require(
                        name.split("/")[0] not in RUNTIME_LINKS and not sensitive_path(name),
                        "Runtime state and Git data are forbidden in releases",
                    )
                    require(member.mode & 0o7000 == 0, "Special archive permissions are forbidden")
                    seen.add(name)
                stream.extractall(staging, members=members, filter="data")
            metadata = verify(staging)
            release_name = metadata["revision"] + ("-rust" if metadata.get("runtime") == "rust" else "")
            destination = root / "releases" / release_name
            require(not destination.exists(), "This revision is already installed")
            for name, target in RUNTIME_LINKS.items():
                (staging / name).symlink_to(Path("../../shared") / target)
            # Make the verified payload durable before it can become current.
            directories = [staging]
            for path in staging.rglob("*"):
                if path.is_symlink():
                    continue
                if path.is_dir():
                    directories.append(path)
                else:
                    with path.open("rb") as file:
                        os.fsync(file.fileno())
            for directory in reversed(directories):
                sync_directory(directory)
            os.rename(staging, destination)
            try:
                sync_directory(root / "releases")
            except OSError as error:
                raise ReleaseStateUncertainError(
                    f"Staged release was renamed to {destination}, but directory sync failed: {error}. "
                    "Staged durability is uncertain; current was NOT changed. "
                    "Inspect the staged release and repair storage before activation."
                ) from error
            print(f"Verified and staged {destination}; NOT activated.")
        finally:
            if staging.exists():
                shutil.rmtree(staging)


def activate(root, revision, runtime="go"):
    require(re.fullmatch(r"[a-f0-9]{40}", revision), "Invalid revision")
    require(runtime in ("go", "rust"), "Unsupported runtime")
    with locked(root):
        release_name = revision + ("-rust" if runtime == "rust" else "")
        release = root / "releases" / release_name
        metadata = verify(release)
        require(metadata.get("runtime", "go") == runtime, "Release runtime mismatch")
        for name, target in RUNTIME_LINKS.items():
            require(
                (release / name).is_symlink()
                and os.readlink(release / name) == str(Path("../../shared") / target),
                f"Invalid runtime link: {name}",
            )
        require((root / "shared/.env").is_file(), "Provision shared/.env before activation")
        current = root / "current"
        if current.exists() or current.is_symlink():
            require(current.is_symlink(), "Current must be an activation symlink")
            previous = current.resolve()
            require(previous.parent == root / "releases", "Current escapes the release store")
            old = verify(previous)
            require(
                not (old.get("runtime", "go") == "rust" and runtime == "go"),
                "Rust-to-Go activation requires a separately reviewed reverse-state migration",
            )
            switching_to_rust = old.get("runtime", "go") == "go" and runtime == "rust"
            require(
                metadata["commitCount"] > old["commitCount"]
                or (switching_to_rust and metadata["commitCount"] == old["commitCount"]),
                "Rollback/re-activation refused: recovery and schema compatibility require a separate reviewed procedure",
            )
        pending = root / ".current-next"
        require(not pending.exists() and not pending.is_symlink(), "Pending activation already exists")
        # Migration failure may leave forward-only schema changes, but never changes
        # current or checkpoints. Do not automatically start an older binary afterward.
        subprocess.run(["bash", str(release / "install/migrate.sh"), "apply"], check=True)
        if runtime == "rust":
            subprocess.run([str(release / "hanabi-live"), "--check-startup"], check=True)
        pending.symlink_to(Path("releases") / release_name)
        os.replace(pending, current)
        try:
            sync_directory(root)
        except OSError as error:
            raise ReleaseStateUncertainError(
                f"current was changed to {revision}, but directory sync failed: {error}. "
                "Activation durability is uncertain. No process was started; keep the service stopped "
                "and inspect current and repair storage before proceeding."
            ) from error
        print(f"Activated {revision}. Start the opt-in release service separately; no process was started.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("manifest", "verify"):
        child = commands.add_parser(command)
        child.add_argument("directory", type=Path)
        if command == "manifest":
            child.add_argument("--runtime", choices=("go", "rust"), default="go")
    commands.add_parser("init").add_argument("root")
    stage_parser = commands.add_parser("stage")
    stage_parser.add_argument("root")
    stage_parser.add_argument("archive", type=Path)
    stage_parser.add_argument("sha256", help="Expected checksum obtained from trusted CI, not an untrusted download")
    activation = commands.add_parser("activate")
    activation.add_argument("root")
    activation.add_argument("revision")
    activation.add_argument("--runtime", choices=("go", "rust"), default="go")
    activation.add_argument("--apply-migrations", action="store_true", required=True)
    args = parser.parse_args()
    try:
        if args.command == "manifest":
            manifest(args.directory.resolve(), args.runtime)
        elif args.command == "verify":
            verify(args.directory.absolute())
        elif args.command == "init":
            init_root(args.root)
        elif args.command == "stage":
            stage(deployment_root(args.root), args.archive, args.sha256)
        else:
            activate(deployment_root(args.root), args.revision, args.runtime)
    except ReleaseStateUncertainError as error:
        parser.exit(2, f"Release state changed; durability unconfirmed: {error}\n")
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, tarfile.TarError) as error:
        parser.exit(1, f"Release operation refused: {error}\n")


if __name__ == "__main__":
    main()
