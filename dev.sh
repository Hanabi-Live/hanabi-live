#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

cd "$DIR"

pids=()
cleanup() {
  if ((${#pids[@]})); then
    kill "${pids[@]}" 2> /dev/null || true
    wait "${pids[@]}" 2> /dev/null || true
  fi
}
trap cleanup EXIT

bash ./run.sh &
pids+=("$!")
bash ./packages/client/esbuild-dev.sh &
pids+=("$!")

wait "${pids[@]}"
