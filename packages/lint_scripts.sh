#!/bin/bash

set -e # Exit on any errors

SECONDS=0

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR_CLIENT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/client"
DIR_DATA="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/data"

# For each directory:
# Step 1 - Use Prettier to check formatting

# Step 2 - Use ESLint to lint the TypeScript
# Since all ESLint errors are set to warnings,
# we set max warnings to 0 so that warnings will fail in CI

# Step 3 - Use ts-prune to check for unused imports
# The "--error" flag makes it return an error code of 1 if unused exports are found

cd "$DIR_CLIENT"

npx prettier --check "src/**/*.ts"
npx eslint --max-warnings 0 src
npx ts-prune --error

cd "$DIR_DATA"

npx prettier --check "src/**/*.ts"
npx eslint --max-warnings 0 src
# ts-prune should not run, there are many exports in @hanabi/data used in other projects only

echo "Successfully linted in $SECONDS seconds."
