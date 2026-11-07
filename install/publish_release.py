#!/usr/bin/env python3
"""Publish approved CI bundles for unauthenticated production downloads."""

import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error

from release import GitHub, REPOSITORY, digest, require


def optional_release(github, path):
    try:
        return github.json(path)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            error.close()
            return None
        raise


def publish(directory, revision, run_url):
    require(re.fullmatch(r"[a-f0-9]{40}", revision), "Invalid release revision.")
    archive = directory / f"hanabi-live-rust-{revision}-linux-amd64.tar.gz"
    checksum = archive.with_name(archive.name + ".sha256").read_text()
    require(checksum.split() == [digest(archive), archive.name], "Release checksum mismatch.")
    sums = directory / "SHA256SUMS"
    sums.write_text(checksum)
    tag = f"server-{revision}"
    github = GitHub()
    latest = optional_release(github, "/releases/latest")
    promote = True
    if latest and latest["tag_name"] != tag:
        previous_tag = latest["tag_name"]
        require(re.fullmatch(r"server-[a-f0-9]{40}", previous_tag),
                "Latest release has an unexpected tag; review before publishing.")
        previous = previous_tag.removeprefix("server-")
        comparison = github.json(f"/compare/{previous}...{revision}")
        if comparison["status"] == "ahead":
            require(comparison["merge_base_commit"]["sha"] == previous,
                    "Release history diverged.")
        else:
            require(comparison["status"] == "behind"
                    and comparison["merge_base_commit"]["sha"] == revision,
                    "Release history diverged.")
            promote = False

    def gh(*arguments):
        subprocess.run(["gh", "release", *arguments, "--repo", REPOSITORY], check=True)

    existing = optional_release(github, f"/releases/tags/{tag}")
    if existing and not existing["draft"]:
        require(not existing["prerelease"] and existing["target_commitish"] == revision,
                "Existing release identity differs.")
        uploaded = {asset["name"] for asset in existing["assets"] if asset["state"] == "uploaded"}
        require({archive.name, sums.name}.issubset(uploaded), "Published release assets are incomplete.")
    else:
        if existing:
            require(existing["target_commitish"] == revision, "Existing draft identity differs.")
        else:
            gh("create", tag, "--draft", "--target", revision,
               "--title", f"Server {revision[:9]}", "--notes", f"Approved CI build: {run_url}")
        gh("upload", tag, str(archive), str(sums), "--clobber")
        gh("edit", tag, "--draft=false", f"--latest={str(promote).lower()}")
        return
    if promote and (not latest or latest["tag_name"] != tag):
        gh("edit", tag, "--latest=true")


def main():
    require(os.environ.get("GITHUB_EVENT_NAME") == "push"
            and os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("GITHUB_REPOSITORY") == REPOSITORY,
            "Public releases must be published by approved main CI.")
    require(len(sys.argv) == 2, "Usage: publish_release.py ARTIFACT_DIRECTORY")
    run_url = (f"https://github.com/{REPOSITORY}/actions/runs/"
               f"{os.environ['GITHUB_RUN_ID']}/attempts/{os.environ['GITHUB_RUN_ATTEMPT']}")
    publish(Path(sys.argv[1]), os.environ["GITHUB_SHA"], run_url)


if __name__ == "__main__":
    main()
