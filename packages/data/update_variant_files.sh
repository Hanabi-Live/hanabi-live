#!/bin/bash

# This script uses the "createVariantsJSON.ts" script to create:
# - $REPO_ROOT/misc/variants.txt
# - $REPO_ROOT/packages/data/src/json/variants.json

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

cd "$DIR"

echo "Creating variants files..."
npx tsx "$DIR/src/createVariantsJSON/createVariantsJSON.ts"
echo "Applying prettier to variants.json..."
npx prettier --write "$DIR/src/json/variants.json"
echo "Done."
