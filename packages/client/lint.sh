#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

SECONDS=0

cd "$DIR"

# Use Prettier to check formatting.
# "--log-level=warn" makes it only output errors.
npx prettier --log-level=warn --ignore-path="$DIR/../../.prettierignore" --check .

# Ensure that the code passes the TypeScript compiler.
npx tsc --noEmit

# Use ESLint to lint the TypeScript.
# "--max-warnings 0" makes warnings fail in CI, since we set all ESLint errors to warnings.
npx eslint --max-warnings 0 .

# Check for unused exports.
# "--error" makes it return an error code of 1 if unused exports are found.
npx ts-prune --error

# Spell check every file using CSpell.
# "--no-progress" and "--no-summary" make it only output errors.
npx cspell --no-progress --no-summary .

echo "Successfully linted in $SECONDS seconds."
