#!/bin/bash

# This script uses the "createVariantsJSON.ts" script to create:
# - ./misc/variants.txt
# - ./packages/game/src/json/variants.json

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

cd "$DIR"

echo "Creating the \"variants.json\" file..."
npx tsx "$DIR/packages/scripts/src/createVariantsJSON/createVariantsJSON.ts"
echo "Formatting the \"variants.json\" file..."
npx prettier --write "$DIR/packages/game/src/json/variants.json"
echo "Done."
