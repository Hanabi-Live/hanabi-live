#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Lint the package in the current directory. Each package's "lint" script runs this from its own
# directory.

PACKAGE_NAME="$(basename "$PWD")"

SECONDS=0

# Ensure that the code passes the TypeScript compiler, while ESLint runs.
bunx --bun --no-install tsc --noEmit &
TSC_PID=$!

# Use ESLint to lint the TypeScript.
# "--max-warnings 0" makes warnings fail in CI, since we set all ESLint errors to warnings.
STATUS=0
bunx --bun --no-install eslint --max-warnings 0 . || STATUS=1
wait "$TSC_PID" || STATUS=1

if ((STATUS != 0)); then
  exit "$STATUS"
fi

echo "Successfully linted package \"$PACKAGE_NAME\" in $SECONDS seconds."
