#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR/.."
if (($# != 1)) || [[ -e "$1" ]]; then
  echo "Usage: $0 NEW_OUTPUT_DIRECTORY" >&2
  exit 1
fi
revision=$(bash scripts/dev/get-version.sh)
mkdir -p "$1"
output=$(cd -- "$1" && pwd)
release="$output/release"
mkdir "$release"

# CI mode avoids sourcing the operator's .env while building static assets.
CI=true bash scripts/dev/build-client.sh
mkdir -p "$release/packages/game/src" "$release/install"
cp -a public "$release/"
cp -a packages/game/src/json "$release/packages/game/src/"
mkdir -p "$release/packages/data/src/json"
cp packages/data/src/json/chatReplyCommands.json "$release/packages/data/src/json/"
cp install/release.py "$release/install/"
cp LICENSE "$release/"

(
  cd server
  case $(rustc -vV | sed -n 's/^host: //p') in
    x86_64-unknown-linux-gnu)
      cargo build --release --locked --target x86_64-unknown-linux-musl
      ;;
    *-apple-darwin)
      # A Mac cross-compiles with Zig as the linker. It needs `rustup target add
      # x86_64-unknown-linux-musl`, `brew install zig`, and `cargo install --locked cargo-zigbuild`.
      cargo zigbuild --release --locked --target x86_64-unknown-linux-musl
      ;;
    *)
      echo "Rust release builds require a Linux amd64 host or a Mac." >&2
      exit 1
      ;;
  esac
)
# CARGO_TARGET_DIR can move the build out of "server/target".
target=$(cd server && cargo metadata --format-version 1 --no-deps \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["target_directory"])')
cp "$target/x86_64-unknown-linux-musl/release/hanabi-live" "$release/hanabi-live"
if file "$release/hanabi-live" | grep -q interpreter; then
  echo "Rust releases must not depend on the build host's dynamic loader." >&2
  exit 1
fi
python3 install/release.py manifest "$release"
# The check runs the server, which a Mac cannot. The production server checks the release again
# before it installs it.
if [[ $(uname -s) == Linux ]]; then
  python3 install/release.py verify "$release"
fi
archive="hanabi-live-$revision-linux-amd64.tar.gz"
# Mac tar would otherwise add "._" files for extended attributes, which the manifest does not list.
COPYFILE_DISABLE=1 tar -czf "$output/$archive" -C "$release" .
(
  cd "$output"
  sha256sum "$archive" > "$archive.sha256"
)
echo "Built $output/$archive"
