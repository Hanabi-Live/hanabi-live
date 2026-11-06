#!/usr/bin/env bash

set -euo pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR/.."
if (($# < 1 || $# > 2)) || [[ -e "$1" ]]; then
  echo "Usage: $0 NEW_OUTPUT_DIRECTORY [rust]" >&2
  exit 1
fi
runtime=${2:-rust}
if [[ $runtime != rust ]]; then
  echo "Only Rust server releases are supported." >&2
  exit 1
fi
if [[ ${GITHUB_ACTIONS:-false} == true ]]; then
  git diff --exit-code HEAD
  if [[ -n $(git ls-files --others --exclude-standard) ]]; then
    echo "CI releases require a clean checkout." >&2
    exit 1
  fi
fi
revision=$(git rev-parse HEAD)
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
cp -a install/migrations "$release/install/"
cp install/migrate.sh install/migration-files.sh install/release.py "$release/install/"
cp install/database_schema.sql "$release/install/"
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
# shellcheck source=migration-files.sh
source install/migration-files.sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOBIN="$release/install" \
  go install -trimpath "github.com/jackc/tern/v2@$TERN_VERSION"
python3 install/release.py manifest "$release" --runtime "$runtime"
python3 install/release.py verify "$release"
archive="hanabi-live-rust-$revision-linux-amd64.tar.gz"
tar -czf "$output/$archive" -C "$release" .
(
  cd "$output"
  sha256sum "$archive" > "$archive.sha256"
)
echo "Built $output/$archive"
