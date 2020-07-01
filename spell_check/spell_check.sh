#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Set the directory to be the root of the repository
# https://stackoverflow.com/questions/8426058/getting-the-parent-of-a-directory-in-bash
DIR="$(dirname "$DIR")"

# Get a list of all files that should be spell-checked
FILES=$(find "$DIR" -type f \
  -not -path "$DIR/.git/*" \
  -not -path "$DIR/backups/*" \
  -not -path "$DIR/client/lib/*" \
  -not -path "$DIR/client/node_modules/*" \
  -not -path "$DIR/client/test_data/*" \
  -not -path "$DIR/client/webpack_output/*" \
  -not -path "$DIR/client/package-lock.json" \
  -not -path "$DIR/data/ongoing_tables/*" \
  -not -path "$DIR/data/specific_deals/*" \
  -not -path "$DIR/data/emojis.json" \
  -not -path "$DIR/data/emotes.json" \
  -not -path "$DIR/data/word_list.txt" \
  -not -path "$DIR/logs/*" \
  -not -path "$DIR/maintenance/go.mod" \
  -not -path "$DIR/maintenance/go.sum" \
  -not -path "$DIR/misc/keldon/*" \
  -not -path "$DIR/public/css/*" \
  -not -path "$DIR/public/img/*" \
  -not -path "$DIR/public/js/lib/*" \
  -not -path "$DIR/public/js/bundles/*" \
  -not -path "$DIR/public/sounds/*" \
  -not -path "$DIR/public/webfonts/*" \
  -not -path "$DIR/scripts/python/emotes/betterttv.txt" \
  -not -path "$DIR/scripts/python/emotes/twitch.txt" \
  -not -path "$DIR/server/src/go.mod" \
  -not -path "$DIR/server/src/go.sum" \
  -not -path "$DIR/spell_check/node_modules/*" \
  -not -path "$DIR/spell_check/package-lock.json" \
  -not -path "$DIR/LICENSE" \
)

# The ".cspell.json" file must live in the root of the repository for the "Code Spell Checker"
# VSCode extension to work properly
cd "$DIR/spell_check"
npx cspell --no-summary --config "$DIR/.cspell.json" $FILES
