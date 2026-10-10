#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Get the name of the repository:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO_NAME="$(basename "$DIR")"

SECONDS=0

cd "$DIR"

# Run each linting task as a background job so that we can use parallel processing to get everything
# done fast.
process_ids=()
bash "$DIR/packages/client/lint.sh" &
process_ids+=("$!")
bash "$DIR/packages/data/lint.sh" &
process_ids+=("$!")
bash "$DIR/packages/game/lint.sh" &
process_ids+=("$!")
bash "$DIR/packages/scripts/lint.sh" &
process_ids+=("$!")
bash "$DIR/packages/server/lint.sh" &
process_ids+=("$!")
# bash "$DIR/server/build_server.sh" &
# (The linting of the Golang code is disabled until it can be rewritten in TypeScript.)
bash "$DIR/check_spelling.sh" &
process_ids+=("$!")
bash "$DIR/check_shellcheck.sh" &
process_ids+=("$!")
bash "$DIR/check_templates.sh" &
process_ids+=("$!")
npm run check-variant-files &
process_ids+=("$!")
npm run lint-package-json &
process_ids+=("$!")

status=0
for pid in "${process_ids[@]}"; do
  wait "$pid" || status=1
done
if ((status != 0)); then
  echo "Linting failed." >&2
  exit "$status"
fi

echo "Successfully linted $REPO_NAME in $SECONDS seconds."
