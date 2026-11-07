#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Get the name of the repository:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO_NAME="$(basename "$DIR")"

SECONDS=0

shard=all
if (($# > 1)); then
  echo "Usage: $0 [--shard=1/2|--shard=2/2]" >&2
  exit 2
fi
case "${1-}" in
  "") ;;
  --shard=1/2) shard=1 ;;
  --shard=2/2) shard=2 ;;
  *)
    echo "Usage: $0 [--shard=1/2|--shard=2/2]" >&2
    exit 2
    ;;
esac

cd "$DIR"

bash "$DIR/packages/client/set-version.sh"

run_repository_check() {
  if [[ ${CI:-} == true ]]; then
    bunx --bun --no-install turbo run "//#$1" --cache=local:rw
  else
    bun run "$1"
  fi
}

# Run each linting task as a background job so that we can use parallel processing to get everything
# done fast.
process_ids=()
run_parallel() {
  local group=$1
  shift
  if [[ $shard == all || $shard == "$group" ]]; then
    "$@" &
    process_ids+=("$!")
  fi
}

lint_filters=()
case "$shard" in
  1) lint_filters=(--filter=@hanabi-live/client-new --filter=@hanabi-live/testing) ;;
  2) lint_filters=(--filter=@hanabi-live/client --filter=@hanabi-live/data --filter=@hanabi-live/game --filter=@hanabi-live/scripts) ;;
  *) ;;
esac
run_parallel "$shard" bunx --bun --no-install turbo run lint --cache=local:rw --continue=always "${lint_filters[@]}"
run_parallel 1 bash "$DIR/check-prettier.sh"
run_parallel 2 bash "$DIR/check-spelling.sh"
run_parallel 1 run_repository_check check-shellcheck
run_parallel 1 run_repository_check check-templates
run_parallel 2 run_repository_check check-variant-files
run_parallel 1 run_repository_check lint-package-json

status=0
for pid in "${process_ids[@]}"; do
  wait "$pid" || status=1
done

# Keep native compiler checks out of the parallel JavaScript batch to limit peak memory in CI.
if [[ $shard != 1 ]]; then
  echo "Checking generated wire contracts."
  bash "$DIR/scripts/bash/generate-protocol.sh" --check || status=1

  cd "$DIR/server"
  echo "Checking Rust formatting and static analysis."
  cargo fmt --all --check || status=1
  cargo clippy --locked --all-targets -- -D warnings || status=1
  cargo clippy --locked --manifest-path engine/Cargo.toml --all-targets -- -D warnings || status=1
  cargo clippy --locked --manifest-path protocol/Cargo.toml --all-targets -- -D warnings || status=1
  cd "$DIR"
fi

if ((status != 0)); then
  echo "Linting failed." >&2
  exit "$status"
fi

if [[ $shard == all ]]; then
  echo "Successfully linted $REPO_NAME in $SECONDS seconds."
else
  echo "Successfully linted shard $shard/2 of $REPO_NAME in $SECONDS seconds."
fi
