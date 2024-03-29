#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# From: https://spin.atomicobject.com/2017/08/24/start-stop-bash-background-process/
# Stop background processes with: Ctrl + c
trap "kill 0" EXIT

./run.sh & # Run the Golang server.
./packages/client/esbuild_dev.sh & # Watch the TypeScript code for any changes.

wait
