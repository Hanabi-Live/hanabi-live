#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the repository:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO_NAME="$(basename "$DIR")"

SECONDS=0

cd "$DIR"

# Run each linting task as a background job so that we can use parallel processing to get everything
# done fast.
bash "$DIR/packages/client/lint.sh" &
bash "$DIR/packages/data/lint.sh" &
bash "$DIR/packages/game/lint.sh" &
bash "$DIR/packages/scripts/lint.sh" &
bash "$DIR/packages/server/lint.sh" &
# bash "$DIR/server/build_server.sh" &
# (The linting of the Golang code is disabled until it can be rewritten in TypeScript.)
bash "$DIR/spell_check.sh" &
bash "$DIR/check_templates.sh" &
npm run check-variant-files &
npm run lint-package-json &
wait

# TODO: https://stackoverflow.com/questions/49513335/bash-wait-exit-on-error-code

echo "Successfully linted $REPO_NAME in $SECONDS seconds."
