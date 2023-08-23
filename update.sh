#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$DIR"

PACKAGE_JSON="$DIR/package.json"
OLD_HASH=$(md5sum "$PACKAGE_JSON")
if [[ -f "$DIR/yarn.lock" ]]; then
  yarn set version latest
fi
# @template-customization-start
# Old versions:
# - drizzle-orm - The latest version is bugged; a new release should be coming within a day or two.
# - konva - Newer versions cause weird graphic glitches. The long-term goal is to move away from
#           konva entirely and use a new graphics library.
# @template-customization-end
npx npm-check-updates --upgrade --packageFile "$PACKAGE_JSON" --filterVersion "^*"
NEW_HASH=$(md5sum "$PACKAGE_JSON")
if [[ "$OLD_HASH" != "$NEW_HASH" ]]; then
  if [[ -f "$DIR/yarn.lock" ]]; then
    yarn install
  elif [[ -f "$DIR/pnpm-lock.yaml" ]]; then
    pnpm install
  else
    npm install
  fi
fi
