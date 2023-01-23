#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

REPO_ROOT="$DIR"
cd "$REPO_ROOT"

# Do nothing if the configuration file does not exist.
CSPELL_CONFIG_NAME="cspell.json"
CSPELL_CONFIG_PATH="$REPO_ROOT/$CSPELL_CONFIG_NAME"
if ! test -f "$CSPELL_CONFIG_PATH"; then
  echo "The \"$CSPELL_CONFIG_NAME\" file does not exist. Skipping checks."
  exit 0
fi

# Do nothing if the configuration file does not have any words in it.
if ! grep -q '"words": ' "$CSPELL_CONFIG_PATH"; then
  echo "The \"$CSPELL_CONFIG_NAME\" file does not have any whitelisted words in it. Skipping checks."
  exit 0
fi

# Make a list of every word that would be reported as misspelled if we didn't have any custom exceptions.

# Extract the custom exceptions from the config
CSPELL_CONFIG_WORDS=$(node -p "
const jsonc = require('jsonc-parser');
const fs = require('fs');
const text = fs.readFileSync('$CSPELL_CONFIG_PATH', 'utf8');
const document = jsonc.parse(text);
document['words'].join('\n')")
# Create a version of the config without custom exceptions
CSPELL_CONFIG_WITHOUT_WORDS=$(node --print "
const jsonc = require('jsonc-parser');
const fs = require('fs');
const text = fs.readFileSync('$CSPELL_CONFIG_PATH', 'utf8');
// Remove the 'words' property from the document
jsonc.applyEdits(text, jsonc.modify(text, ['words'], undefined, {}))
")
CSPELL_CONFIG_TEMP_PATH="/tmp/cspell-temp.json"
mv "$CSPELL_CONFIG_PATH" "$CSPELL_CONFIG_TEMP_PATH"
echo "$CSPELL_CONFIG_WITHOUT_WORDS" > "$CSPELL_CONFIG_PATH"
MISSPELLED_WORDS_PATH="/tmp/misspelled-words.txt"
npx cspell --no-progress --no-summary --unique --words-only . | sort --ignore-case --unique > "$MISSPELLED_WORDS_PATH"
mv "$CSPELL_CONFIG_TEMP_PATH" "$CSPELL_CONFIG_PATH"

# Check that each "cspell.json" word is actually being used.
echo "Checking for orphaned CSpell configuration words in: $CSPELL_CONFIG_PATH"

ONE_OR_MORE_FAILURES=0
set +e
for LINE in $CSPELL_CONFIG_WORDS; do
  LINE_TRIMMED=$(echo "$LINE" | xargs)
  grep --line-regexp "$LINE_TRIMMED" "$MISSPELLED_WORDS_PATH" --ignore-case --quiet
  MATCH1=$?
  grep --line-regexp "$LINE_TRIMMED's" "$MISSPELLED_WORDS_PATH" --ignore-case --quiet
  MATCH2=$?
  if [ $MATCH1 != 0 ] && [ $MATCH2 != 0 ]; then
    echo "The following word in the CSpell config is not being used: $LINE_TRIMMED"
    ONE_OR_MORE_FAILURES=1
  fi
done
set -e

rm -f "$MISSPELLED_WORDS_PATH"

if [ $ONE_OR_MORE_FAILURES -ne "0" ]; then
  echo "CSpell configuration words are not valid."
  exit 1
fi

echo "CSpell configuration words are valid."
