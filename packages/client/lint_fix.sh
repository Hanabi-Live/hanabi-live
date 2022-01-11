#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

SECONDS=0

cd "$DIR"

npx eslint --max-warnings 0 src --fix
npx prettier --write "src/**/*.ts"

# TODO
#npx ts-prune --error

echo "Successfully linted in $SECONDS seconds."
