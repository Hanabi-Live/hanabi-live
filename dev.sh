#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.

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
bash ./packages/client/esbuild_dev.sh &
pids+=("$!")

wait "${pids[@]}"
