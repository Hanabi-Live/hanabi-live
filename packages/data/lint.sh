#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of this package:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
PACKAGE_NAME="$(basename "$DIR")"

SECONDS=0

cd "$DIR"

# Ensure that the code passes the TypeScript compiler.
npx tsc --noEmit

# Use ESLint to lint the TypeScript.
# "--max-warnings 0" makes warnings fail in CI, since we set all ESLint errors to warnings.
npx eslint --max-warnings 0 .

# Check for unused exports.
# "--error" makes it return an error code of 1 if unused exports are found.
# TODO: Commented out while we have relative path imports. Refactor game logic into @game and then
# use that.
# npx ts-prune --error --ignore "index.ts"

# Ensure that the "update_variant_files.sh" script does not change the files that are checked into
# the repository.
VARIANTS_JSON="$DIR/src/json/variants.json"
TMP_VARIANTS_JSON="/tmp/variants.json"
cp "$VARIANTS_JSON" "$TMP_VARIANTS_JSON"
REPO_ROOT="$DIR/../.."
VARIANTS_TXT="$REPO_ROOT/misc/variants.txt"
TMP_VARIANTS_TXT="/tmp/variants.txt"
cp "$VARIANTS_TXT" "$TMP_VARIANTS_TXT"
bash "$DIR/update_variant_files.sh" > /dev/null
diff "$VARIANTS_JSON" "$TMP_VARIANTS_JSON"
diff "$VARIANTS_TXT" "$TMP_VARIANTS_TXT"
rm -f "$TMP_VARIANTS_JSON"
rm -f "$TMP_VARIANTS_TXT"

echo "Successfully linted package \"$PACKAGE_NAME\" in $SECONDS seconds."
