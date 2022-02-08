#!/bin/bash

set -e # Exit on any errors

lint() {
  cd $1

  # Step 1 - Use Prettier to check formatting
  npx prettier --check "src/**/*.ts"

  # Step 2 - Use ESLint to lint the TypeScript
  # Since all ESLint errors are set to warnings,
  # we set max warnings to 0 so that warnings will fail in CI
  npx eslint --max-warnings 0 src

  # Step 3 - Use ts-prune to check for unused imports
  # The "--error" flag makes it return an error code of 1 if unused exports are found
  # ts-prune should not run, there are many exports in @hanabi/data used in other projects only
  if [ $# -eq 1 ]
  then
    npx ts-prune --error
  fi
}

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
MAIN_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

DIR_CLIENT="$MAIN_DIR/client"
DIR_DATA="$MAIN_DIR/data"

SECONDS=0

lint $DIR_CLIENT
lint $DIR_DATA "no ts-prune"

echo "Successfully linted in $SECONDS seconds."
