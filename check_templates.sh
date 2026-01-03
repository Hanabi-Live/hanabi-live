#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

cd "$DIR"

npx complete-cli check --ignore "ci.yml,build.ts,eslint.config.mjs,LICENSE,lint.ts,tsconfig.json"
