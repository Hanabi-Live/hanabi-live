#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR/.."
if (($# != 1)) || [[ -e "$1" ]]; then
  echo "Usage: $0 NEW_OUTPUT_DIRECTORY" >&2
  exit 1
fi
if [[ ${GITHUB_ACTIONS:-false} == true ]]; then
  git diff --exit-code HEAD
  if [[ -n $(git ls-files --others --exclude-standard) ]]; then
    echo "CI releases require a clean checkout." >&2
    exit 1
  fi
fi
revision=$(bash packages/client/get-version.sh)
mkdir -p "$1"
output=$(cd -- "$1" && pwd)
release="$output/release"
mkdir "$release"

# CI mode avoids sourcing the operator's .env while building static assets.
CI=true bash packages/client/build-client.sh
mkdir -p "$release/packages/game/src" "$release/install"
cp -a public "$release/"
cp -a packages/game/src/json "$release/packages/game/src/"
mkdir -p "$release/packages/data/src/json"
cp packages/data/src/json/chatReplyCommands.json "$release/packages/data/src/json/"
cp install/release.py "$release/install/"
cp LICENSE "$release/"

(
  cd server
  if [[ $(rustc -vV | sed -n 's/^host: //p') != x86_64-unknown-linux-gnu ]]; then
    echo "Rust release builds require a Linux amd64 host." >&2
    exit 1
  fi
  cargo build --release --locked --target x86_64-unknown-linux-musl
)
cp server/target/x86_64-unknown-linux-musl/release/hanabi-live "$release/hanabi-live"
if readelf -l "$release/hanabi-live" | grep -q INTERP; then
  echo "Rust releases must not depend on the build host's dynamic loader." >&2
  exit 1
fi
python3 install/release.py manifest "$release"
python3 install/release.py verify "$release"
archive="hanabi-live-$revision-linux-amd64.tar.gz"
tar -czf "$output/$archive" -C "$release" .
(
  cd "$output"
  sha256sum "$archive" > "$archive.sha256"
)
echo "Built $output/$archive"
