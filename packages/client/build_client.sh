#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

SECONDS=0

REPO_ROOT="$DIR/../.."

# Import the port.
if [[ -z ${CI-} ]]; then
  ENV_PATH="$REPO_ROOT/.env"
  if [[ ! -f $ENV_PATH ]]; then
    echo "Failed to find the \".env\" file at: $ENV_PATH"
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_PATH"
  if [[ -z ${PORT-} ]]; then
    PORT="80"
  fi
fi

# Get the "VERSION" environment variable.
# shellcheck disable=SC1091
source "$DIR/get_version.sh"

# Prepare the "version.js" file.
bash "$DIR/set_version.sh"

# If we need to, add the NPM directory to the path. (The Golang process will execute this script
# during a graceful restart and it will not have it in the path by default.)
if ! command -v npm > /dev/null; then
  # MacOS only has Bash version 3, which does not have associative arrays,
  # so the below check will not work
  # https://unix.stackexchange.com/questions/92208/bash-how-to-get-the-first-number-that-occurs-in-a-variables-content
  BASH_VERSION_FIRST_DIGIT=$(bash --version | grep -o -E '[0-9]+' | head -1 | sed -e 's/^0\+//')
  if [[ $BASH_VERSION_FIRST_DIGIT -lt 4 ]]; then
    echo "Failed to find the \"npm\" binary (on bash version $BASH_VERSION_FIRST_DIGIT)."
    exit 1
  fi

  # Assume that Node Version Manager (nvm) is being used on this system
  # https://github.com/creationix/nvm
  NODE_VERSION_DIRS=(/root/.nvm/versions/node/*)
  NODE_VERSION_DIR="${NODE_VERSION_DIRS[-1]}"
  if [[ ! -d $NODE_VERSION_DIR ]]; then
    echo "Failed to find the \"npm\" binary (in the \"/root/.nvm/versions/node\" directory)."
    exit 1
  fi
  NPM_BIN_DIR="$NODE_VERSION_DIR/bin"
  export PATH=$NPM_BIN_DIR:$PATH
fi

cd "$DIR"

# The client is written in TypeScript and spread out across many files. We need to pack it into one
# JavaScript file before sending it to end-users.
echo "Packing the TypeScript using esbuild..."
echo
JS_BUNDLES_DIR="$REPO_ROOT/public/js/bundles"
JS_BUNDLE_PATH="$JS_BUNDLES_DIR/main.$VERSION.min.js"
npx esbuild "$DIR/src/main.ts" --bundle --outfile="$JS_BUNDLE_PATH" --minify --sourcemap="linked"
echo

# Similar to the JavaScript, we need to concatenate all of the CSS into one file before sending it
# to end-users
if [[ ${1-} == "crit" ]]; then
  echo "Packing the CSS and generating critical CSS using Grunt..."
  echo
  npx grunt critical --url="http://localhost:$PORT"
  echo
  echo "Remember to commit the \"critical.min.css\" file if it had any changes."
  echo
else
  echo "Packing the CSS using Grunt..."
  echo
  npx grunt
  echo
fi
GRUNT_OUTPUT_DIR="$DIR/grunt_output"
CSS_DIR="$REPO_ROOT/public/css"
cp "$GRUNT_OUTPUT_DIR/main.$VERSION.min.css" "$CSS_DIR/"

# In addition to the numerical version (e.g. the number of commits), it is also handy to have the
# exact git commit hash for the current build and the time that it was created.
echo "$VERSION" > "$JS_BUNDLES_DIR/version.txt"
git rev-parse HEAD > "$JS_BUNDLES_DIR/git_revision.txt"
date > "$JS_BUNDLES_DIR/date_compiled.txt"

# Clean up the output directories.
rm -rf "$GRUNT_OUTPUT_DIR"

# Clean up old files in the "bundles" directory. (We do not use an environment variable to store the
# results of `ls` because it will cause the script to stop execution in the case where there are no
# results.)
cd "$JS_BUNDLES_DIR"
# shellcheck disable=SC2010,SC2143
if [[ $(ls | grep -v "main.$VERSION" | grep -v version.txt | grep -v git_revision.txt | grep -v date_compiled.txt) ]]; then
  ls | grep -v "main.$VERSION" | grep -v version.txt | grep -v git_revision.txt | grep -v date_compiled.txt | xargs rm
fi

# Clean up the files in the CSS directory.
cd "$CSS_DIR"
# shellcheck disable=SC2010,SC2143
if [[ $(ls main.*.min.css | grep -v "main.$VERSION.min.css") ]]; then
  ls main.*.min.css | grep -v "main.$VERSION.min.css" | xargs rm
fi

cd "$DIR"

echo "Client version $VERSION successfully built in $SECONDS seconds."
