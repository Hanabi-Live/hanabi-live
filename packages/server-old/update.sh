#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$DIR"

PACKAGE_JSON="$DIR/package.json"
OLD_HASH=$(md5sum "$PACKAGE_JSON")
npx npm-check-updates --upgrade --packageFile "$PACKAGE_JSON"
NEW_HASH=$(md5sum "$PACKAGE_JSON")
if [[ $OLD_HASH != $NEW_HASH ]]; then
  npm install
fi
