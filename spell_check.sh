#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$DIR"

# Spell check every file using CSpell.
# We use "--no-progress" and "--no-summary" because we want to only output errors.
# We use "--gitignore" because we want to ignore files which will are not included in the repo.
# (The VS Code extension ignores gitignore files by default, so we want the CLI to be unified with
# the editor.)
npx cspell lint --no-progress --no-summary --gitignore

# Check for orphaned words.
bash "$DIR/check-orphaned-words.sh"
