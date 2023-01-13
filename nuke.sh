#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

NPM_LOCK="$DIR/package-lock.json"
if test -f "$NPM_LOCK"; then
  rm -f "$NPM_LOCK"
  echo "Successfully deleted: $NPM_LOCK"
fi

YARN_LOCK="$DIR/yarn.lock"
if test -f "$YARN_LOCK"; then
  rm -f "$YARN_LOCK"
  echo "Successfully deleted: $YARN_LOCK"
fi

NODE_MODULES="$DIR/node_modules"
if test -d "$NODE_MODULES"; then
  rm -rf "$NODE_MODULES"
  echo "Successfully deleted: $NODE_MODULES"
fi

yarn install
echo "Successfully reinstalled Node dependencies."
