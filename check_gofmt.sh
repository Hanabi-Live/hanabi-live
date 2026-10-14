#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

cd "$DIR"

unformatted=$(gofmt -l server maintenance)
if [[ -n "$unformatted" ]]; then
  echo "Go files are not formatted with gofmt:" >&2
  printf '%s\n' "$unformatted" >&2
  echo "Run 'gofmt -w server maintenance' from the repository root to fix them." >&2
  exit 1
fi
