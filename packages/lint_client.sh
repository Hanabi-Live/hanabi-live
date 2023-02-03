#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

SECONDS=0

lint() {
  cd "$1"

  # Use ESLint to lint the TypeScript.
  # "--max-warnings 0" makes warnings fail in CI, since we set all ESLint errors to warnings.
  echo "Running ESLint on: $1"
  npx eslint --max-warnings 0 src

  # Use ts-prune to check for unused imports.
  # "--error" makes it return an error code of 1 if unused exports are found.
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
# "--loglevel warn" makes it only output errors.
echo "Running Prettier on the repository."
cd "$DIR/.."
npx prettier --loglevel warn --check .

echo "Successfully linted in $SECONDS seconds."
