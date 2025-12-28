#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

cd "$DIR" # Required so that `tsx` can resolve the correct "tsconfig.json" file.

# Run the TypeScript code without pre-compiling by using `tsx`. (This is useful for development.)
npx tsx watch "$DIR/src/main.ts"
