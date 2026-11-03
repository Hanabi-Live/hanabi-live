#!/usr/bin/env bash

set -euo pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR/.."
if (($# < 1 || $# > 2)) || [[ -e "$1" ]]; then
  echo "Usage: $0 NEW_OUTPUT_DIRECTORY [go|rust]" >&2
  exit 1
fi
runtime=${2:-go}
if [[ $runtime != go && $runtime != rust ]]; then
  echo "Runtime must be go or rust." >&2
  exit 1
fi
if [[ $(git rev-parse --is-shallow-repository) != false ]]; then
  echo "A full Git history is required for the client version." >&2
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
CI=true bash packages/client/build_client.sh
mkdir -p "$release/server/src" "$release/packages/game/src" "$release/install"
cp -a public "$release/"
cp -a server/src/views "$release/server/src/"
cp -a packages/game/src/json "$release/packages/game/src/"
mkdir -p "$release/packages/server/src/json"
cp packages/server/src/json/chatReplyCommands.json "$release/packages/server/src/json/"
mkdir "$release/misc"
cp misc/word_list.txt "$release/misc/"
cp -a install/migrations "$release/install/"
cp install/migrate.sh install/migration_files.sh install/release.py "$release/install/"
cp install/database_schema.sql "$release/install/"
cp LICENSE "$release/"

if [[ $runtime == rust ]]; then
  (
    cd experimental/rust-server
    if [[ $(rustc -vV | sed -n 's/^host: //p') != x86_64-unknown-linux-gnu ]]; then
      echo "Rust release builds require a Linux amd64 host." >&2
      exit 1
    fi
    cargo build --release --locked --target x86_64-unknown-linux-musl
  )
  cp experimental/rust-server/target/x86_64-unknown-linux-musl/release/hanabi-rust-poc "$release/hanabi-live"
  if readelf -l "$release/hanabi-live" | grep -q INTERP; then
    echo "Rust releases must not depend on the build host's dynamic loader." >&2
    exit 1
  fi
else
  (
    cd server/src
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
      -ldflags="-s -w -X main.buildRevision=$revision" -o "$release/hanabi-live" .
  )
fi
# shellcheck source=./install/migration_files.sh
source install/migration_files.sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOBIN="$release/install" \
  go install -trimpath "github.com/jackc/tern/v2@$TERN_VERSION"
python3 install/release.py manifest "$release" --runtime "$runtime"
python3 install/release.py verify "$release"
archive="hanabi-live-$revision-linux-amd64.tar.gz"
if [[ $runtime == rust ]]; then
  archive="hanabi-live-rust-$revision-linux-amd64.tar.gz"
fi
tar -czf "$output/$archive" -C "$release" .
(
  cd "$output"
  sha256sum "$archive" > "$archive.sha256"
)
echo "Built $output/$archive"
