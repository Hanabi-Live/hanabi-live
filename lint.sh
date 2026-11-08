#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Get the name of the repository:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO_NAME="$(basename "$DIR")"

SECONDS=0

# CI runs the checks that need the Rust toolchain in a separate job, so that the JavaScript checks
# do not wait for it to be installed. Locally, run every check.
usage="Usage: $0 [--only=javascript|--only=rust]"
only=all
if (($# > 1)); then
  echo "$usage" >&2
  exit 2
fi
case "${1-}" in
  "") ;;
  --only=javascript) only=javascript ;;
  --only=rust) only=rust ;;
  *)
    echo "$usage" >&2
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

lint_rust() {
  if [[ ${CI:-} == true ]]; then
    bunx --bun --no-install turbo run "//#lint-rust" --cache=local:rw
  else
    bash "$DIR/scripts/lint/check-rust.sh"
  fi
}

# Run each linting task as a background job so that we can use parallel processing to get everything
# done fast.
process_ids=()
run_parallel() {
  local group=$1
  shift
  if [[ $only == all || $only == "$group" ]]; then
    "$@" &
    process_ids+=("$!")
  fi
}

run_parallel javascript bunx --bun --no-install turbo run lint --cache=local:rw --continue=always
run_parallel javascript bash "$DIR/scripts/lint/check-prettier.sh"
run_parallel javascript bash "$DIR/scripts/lint/check-spelling.sh"
run_parallel javascript run_repository_check check-css
run_parallel javascript run_repository_check check-knip
run_parallel javascript run_repository_check check-shellcheck
run_parallel javascript run_repository_check check-templates
run_parallel javascript run_repository_check check-variant-files
run_parallel javascript run_repository_check lint-package-json
run_parallel rust lint_rust

status=0
for pid in "${process_ids[@]}"; do
  wait "$pid" || status=1
done

if ((status != 0)); then
  echo "Linting failed." >&2
  exit "$status"
fi

if [[ $only == all ]]; then
  echo "Successfully linted $REPO_NAME in $SECONDS seconds."
else
  echo "Successfully ran the $only checks for $REPO_NAME in $SECONDS seconds."
fi
