#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Lint the package in the current directory. Each package's "lint" script runs this from its own
# directory.

PACKAGE_NAME="$(basename "$PWD")"

SECONDS=0

# Ensure that the code passes the TypeScript compiler.
bunx --bun --no-install tsc --noEmit

# Use ESLint to lint the TypeScript.
# "--max-warnings 0" makes warnings fail in CI, since we set all ESLint errors to warnings.
bunx --bun --no-install eslint --max-warnings 0 .

echo "Successfully linted package \"$PACKAGE_NAME\" in $SECONDS seconds."
