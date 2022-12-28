#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

SECONDS=0

lint() {
  cd "$1"

  # Step 1 - Use ESLint to lint the TypeScript.
  # We use "--max-warnings" so that any warnings will fail in CI.
  echo "Running eslint on: $1"
  npx eslint --max-warnings 0 src

  # Step 2 - Use ts-prune to check for unused imports.
  # The "--error" flag makes it return an error code of 1 if unused exports are found.
  # ts-prune is conditional because there are many exports in "@hanabi/data" that are used in other
  # projects only.
  if [ $# -eq 1 ]; then
    echo "Running ts-prune on: $1"
    npx ts-prune --error
  fi
}

lint "$DIR/client"
lint "$DIR/data" "no-ts-prune"

cd "$DIR/client"
npx eslint --max-warnings 0 test

# Use Prettier to check formatting on the entire repository.
echo "Running prettier on the repository."
cd "$DIR/.."
npx prettier --check .

echo "Successfully linted in $SECONDS seconds."
