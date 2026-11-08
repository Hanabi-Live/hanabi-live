#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "$DIR/../.." &> /dev/null && pwd)

cd "$REPO_ROOT"
status=0

echo "Checking generated wire contracts."
bash scripts/dev/generate-protocol.sh --check || status=1

cd server
echo "Checking Rust formatting and static analysis."
cargo fmt --all --check || status=1
cargo clippy --locked --workspace --all-targets -- -D warnings || status=1

exit "$status"
