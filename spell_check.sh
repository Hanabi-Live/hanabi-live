#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

FILES=$(find "$DIR" -type f \
  -not -path "$DIR/.git/*" \
  -not -path "$DIR/backups/*" \
  -not -path "$DIR/client/lib/*" \
  -not -path "$DIR/client/node_modules/*" \
  -not -path "$DIR/client/webpack_output/*" \
  -not -path "$DIR/client/package-lock.json" \
  -not -path "$DIR/data/ongoing-tables/*" \
  -not -path "$DIR/data/specific-deals/*" \
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
  -not -path "$DIR/LICENSE" \
)

cd "$DIR/client"
npx cspell --no-summary --config "$DIR/.cspell.json" $FILES
