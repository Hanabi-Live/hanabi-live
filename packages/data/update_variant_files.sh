#!/bin/bash

# This script reads the source files:
# - src/getVariantDescriptions.ts
# - src/createVariants/createVariantsJSON.ts (and helpers)
# and writes to the files:
# - $REPO_ROOT/misc/variants.txt
# - src/json/variants.json

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

cd "$DIR"

echo "Creating variants files..."
npx ts-node "$DIR/src/createVariants/createVariantsJSON.ts"
echo "Applying prettier to variants.json..."
npx prettier --write "$DIR/src/json/variants.json"
echo "Done."
