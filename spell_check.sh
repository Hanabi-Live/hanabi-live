#!/bin/bash

# From: https://github.com/eleven-labs/blog.eleven-labs.com/blob/master/bin/check-spelling.sh

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

MARKDOWN_TEXT=$(cat $DIR/*.md && cat $DIR/docs/*.md)
MARKDOWN_TEXT=$(echo $MARKDOWN_TEXT | sed 's/`.+`//g') # Remove code blocks
MISSPELLED=`echo $MARKDOWN_TEXT | aspell --lang=en --encoding=utf-8 --personal="$DIR/.aspell.en.pws" list | sort -u`

if [[ -z $MISSPELLED ]]; then
  echo "No misspelled words."
  exit 0
fi

echo -e "Misspelled words:"
MISSPELLED=`echo "$MISSPELLED" | sed -E ':a;N;$!ba;s/\n/, /g'`
echo "$MISSPELLED"
exit 1
