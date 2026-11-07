#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

cd "$DIR"

bunx --bun --no-install complete-cli check --ignore "action.yml,ci.yml,build.ts,eslint.config.mjs,knip.config.js,LICENSE,lint.ts,tsconfig.json"
