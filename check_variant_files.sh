#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Ensure that the "update_variant_files.sh" script does not change the files that are checked into
# the repository.
VARIANTS_JSON="$DIR/packages/data/src/json/variants.json"
TMP_VARIANTS_JSON="/tmp/variants.json"
cp "$VARIANTS_JSON" "$TMP_VARIANTS_JSON"
VARIANTS_TXT="$DIR/misc/variants.txt"
TMP_VARIANTS_TXT="/tmp/variants.txt"
cp "$VARIANTS_TXT" "$TMP_VARIANTS_TXT"
bash "$DIR/update_variant_files.sh" > /dev/null
diff "$VARIANTS_JSON" "$TMP_VARIANTS_JSON"
diff "$VARIANTS_TXT" "$TMP_VARIANTS_TXT"
rm -f "$TMP_VARIANTS_JSON"
rm -f "$TMP_VARIANTS_TXT"
