#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

SECONDS=0

REPO_ROOT="$DIR/../.."

# Get the "VERSION" environment variable.
# shellcheck disable=SC1091
source "$DIR/get-version.sh"

# Prepare the "version.js" file.
bash "$DIR/set-version.sh"

if ! command -v bun > /dev/null; then
  export PATH="${BUN_INSTALL:-${HOME:-/root}/.bun}/bin:$PATH"
fi
if ! command -v bun > /dev/null; then
  echo "Bun is required to build the clients. See docs/install.md." >&2
  exit 1
fi

cd "$DIR"

# The client is written in TypeScript and spread out across many files. We need to pack it into one
# JavaScript file before sending it to end-users.
echo "Packing the TypeScript using Vite..."
echo
JS_BUNDLES_DIR="$REPO_ROOT/public/js/bundles"
bunx --bun --no-install vite build
bash "$REPO_ROOT/scripts/dev/build-standalone.sh"
echo

# Similar to the JavaScript, we need to concatenate all of the CSS into one file before sending it
# to end-users
echo "Packing the CSS using Lightning CSS..."
CSS_DIR="$REPO_ROOT/public/css"
bun "$REPO_ROOT/packages/scripts/src/buildCSS.mts" "$CSS_DIR/main.$VERSION.min.css"
if [[ ${1-} == "crit" ]]; then
  bash "$DIR/build-critical-css.sh"
fi
echo

echo "$VERSION" > "$JS_BUNDLES_DIR/version.txt"
echo "$VERSION" > "$JS_BUNDLES_DIR/git_revision.txt"
date > "$JS_BUNDLES_DIR/date_compiled.txt"

# Clean up the bundles of older versions and of removed standalone pages.
cd "$JS_BUNDLES_DIR"
for file in *; do
  case $file in
    "main.$VERSION".* | version.txt | git_revision.txt | date_compiled.txt) continue ;;
    *) ;;
  esac
  page=${file%%.*}
  if [[ $file == "$page.min.js"* && -f "$DIR/src/standalone/$page.ts" ]]; then
    continue
  fi
  rm "$file"
done

# Clean up the files in the CSS directory.
cd "$CSS_DIR"
# shellcheck disable=SC2010,SC2143
if [[ -n $(ls main.*.min.css | grep -v "main.$VERSION.min.css") ]]; then
  ls main.*.min.css | grep -v "main.$VERSION.min.css" | xargs rm
fi

cd "$DIR"

echo "Client version $VERSION successfully built in $SECONDS seconds."
