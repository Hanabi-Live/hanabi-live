"""Skip unchanged TypeDoc deployments without treating failed attempts as deployed."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[2]
INPUTS = (
    "packages/game",
    "package.json",
    "bun.lock",
    "bunfig.toml",
    ".npmrc",
    "README.md",
    "LICENSE",
    "patches",
    ":(top,glob)tsconfig*.json",
    ":(top,glob)typedoc*",
    ":(top,glob).typedoc*",
    "tsdoc.json",
    ".config",
    ".github/workflows/ci.yml",
    ".github/workflows/setup-bun",
    "scripts/ci/typedoc_deployment.py",
)


def github(repository, path, payload=None):
    arguments = [
        "gh", "api", "--hostname", "github.com",
        "--method", "GET" if payload is None else "POST",
        f"repos/{repository}/{path}",
    ]
    if payload is not None:
        arguments.extend(["--input", "-"])
    result = subprocess.run(
        arguments, input=None if payload is None else json.dumps(payload),
        stdout=subprocess.PIPE, text=True, check=True, timeout=60,
    )
    return json.loads(result.stdout)


def git(root, *arguments, check=True, **kwargs):
    return subprocess.run(
        ["git", *arguments], cwd=root, stdout=subprocess.PIPE, text=True,
        check=check, timeout=60, **kwargs,
    )


def identifier(value):
    if type(value) is not int or value <= 0:
        raise ValueError("Invalid TypeDoc deployment identifier.")
    return value


def inputs_changed(root, revision):
    if not isinstance(revision, str) or not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", revision):
        raise ValueError("Invalid deployed TypeDoc revision.")
    exists = git(root, "cat-file", "-e", f"{revision}^{{commit}}", check=False, stderr=subprocess.DEVNULL)
    if exists.returncode:
        git(root, "fetch", "--quiet", "--no-tags", "--depth=1", "origin", revision)
    difference = git(root, "diff", "--quiet", revision, "HEAD", "--", *INPUTS, check=False)
    if difference.returncode not in (0, 1):
        difference.check_returncode()
    return difference.returncode == 1


def prepare(root, request):
    deployments = request("deployments?task=typedoc&environment=github-pages&per_page=1")
    if deployments:
        previous = deployments[0]
        previous_id = identifier(previous["id"])
        statuses = request(f"deployments/{previous_id}/statuses?per_page=1")
        state = statuses[0]["state"] if statuses else "pending"
        if state not in {"pending", "queued", "in_progress", "success", "failure", "error", "inactive"}:
            raise ValueError("Unknown TypeDoc deployment state.")
        if state == "success":
            if not inputs_changed(root, previous["sha"]):
                print(f"TypeDoc inputs match successful deployment {previous_id}; skipping publication.")
                return None
            print(f"TypeDoc inputs changed since deployment {previous_id}; publishing current inputs.")
        else:
            print(f"TypeDoc deployment {previous_id} is {state}; retrying publication.")
    else:
        print("No tracked TypeDoc deployment; publishing initial inputs.")

    revision = git(root, "rev-parse", "HEAD").stdout.strip()
    deployment = request("deployments", {
        "ref": revision,
        "task": "typedoc",
        "environment": "github-pages",
        "auto_merge": False,
        "required_contexts": [],
        "description": "Publish TypeDoc documentation",
    })
    if deployment["sha"] != revision:
        raise ValueError("TypeDoc deployment does not match the checked-out revision.")
    return identifier(deployment["id"])


def record(request, deployment_id, state, log_url):
    request(f"deployments/{identifier(deployment_id)}/statuses", {
        "state": state,
        "log_url": log_url,
        "description": "TypeDoc publication succeeded" if state == "success" else "TypeDoc publication failed",
        "auto_inactive": False,
    })


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("prepare")
    completion = commands.add_parser("record")
    completion.add_argument("deployment_id", type=int)
    completion.add_argument("state", choices=["success", "failure"])
    arguments = parser.parse_args()
    repository = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+", repository):
        raise ValueError("Invalid GitHub repository.")

    def request(path, payload=None):
        return github(repository, path, payload)

    if arguments.command == "prepare":
        deployment_id = prepare(ROOT, request)
        with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
            output.write(f"changed={'true' if deployment_id is not None else 'false'}\n")
            if deployment_id is not None:
                output.write(f"deployment_id={deployment_id}\n")
    else:
        run_id = int(os.environ["GITHUB_RUN_ID"])
        attempt = int(os.environ["GITHUB_RUN_ATTEMPT"])
        log_url = f"https://github.com/{repository}/actions/runs/{run_id}/attempts/{attempt}"
        record(request, arguments.deployment_id, arguments.state, log_url)


if __name__ == "__main__":
    main()
