#!/usr/bin/env bash

set -euo pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR"
cargo build --release --locked
cp target/release/hanabi-live ../hanabi-live.next
mv ../hanabi-live.next ../hanabi-live
