#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of this package:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
PACKAGE_NAME="$(basename "$DIR")"

SECONDS=0

cd "$DIR"

# Ensure that the code passes the TypeScript compiler.
npx tsc --noEmit

# Use ESLint to lint the TypeScript.
# "--max-warnings 0" makes warnings fail in CI, since we set all ESLint errors to warnings.
npx eslint --max-warnings 0 .

# Check for unused exports.
# "--error" makes it return an error code of 1 if unused exports are found.
# TODO: Commented out while we have relative path imports. Refactor game logic into @game and then
# use that.
# npx ts-prune --error --ignore "index.ts"

echo "Successfully linted package \"$PACKAGE_NAME\" in $SECONDS seconds."
