#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Reset the internal SECONDS variable so that we can measure how long this script takes to complete
# https://stackoverflow.com/questions/16908084/bash-script-to-calculate-time-elapsed
SECONDS=0

# Set the version number in the "version.json" file
# (which is equal to the number of commits in the git repository)
# This is "baked" into the JavaScript bundle and self-reported when connecting to the server so that
# the server can deny clients on old versions of the code
VERSION=$(git rev-list --count HEAD)
echo "$VERSION" > "$DIR/../data/version.json"

# If we need to, add the NPM directory to the path
# (the Golang process will execute this script during a graceful restart and it will not have it in
# the path by default)
if ! command -v npx > /dev/null; then
  # MacOS only has Bash version 3, which does not have associative arrays,
  # so the below check will not work
  # https://unix.stackexchange.com/questions/92208/bash-how-to-get-the-first-number-that-occurs-in-a-variables-content
  BASH_VERSION_FIRST_DIGIT=$(bash --version | grep -o -E '[0-9]+' | head -1 | sed -e 's/^0\+//')
  if [[ $BASH_VERSION_FIRST_DIGIT -lt 4 ]]; then
    echo "Failed to find the \"npx\" binary (on bash version $BASH_VERSION_FIRST_DIGIT)."
    exit 1
  fi

  # Assume that Node Version Manager (nvm) is being used on this system
  # https://github.com/creationix/nvm
  NODE_VERSION_DIRS=(/root/.nvm/versions/node/*)
  NODE_VERSION_DIR="${NODE_VERSION_DIRS[-1]}"
  if [[ ! -d $NODE_VERSION_DIR ]]; then
    echo "Failed to find the \"npx\" binary (in the \"/root/.nvm/versions/node\" directory)."
    exit 1
  fi
  NPM_BIN_DIR="$NODE_VERSION_DIR/bin"
  export PATH=$NPM_BIN_DIR:$PATH
fi

cd "$DIR"

# The client is written in TypeScript and spread out across many files
# We need to pack it into one JavaScript file before sending it to end-users
echo "Packing the TypeScript using WebPack..."
echo
npx webpack
echo

# Create a file that informs the server that the compiled JavaScript will not be available for the
# next few milliseconds or so
COMPILING_FILE="$DIR/../compiling_client"
touch "$COMPILING_FILE"

# We don't want to serve files directly out of the WebPack output directory because that would
# cause website downtime during client compilation; the Golang server will look at the "bundles"
# directory to see what the latest version of the client is
WEBPACK_OUTPUT_DIR="$DIR/webpack_output"
BUNDLES_DIR="$DIR/../public/js/bundles"
cp "$WEBPACK_OUTPUT_DIR/main.$VERSION.min.js" "$BUNDLES_DIR/"
cp "$WEBPACK_OUTPUT_DIR/main.$VERSION.min.js.map" "$BUNDLES_DIR/"
echo "$VERSION" > "$BUNDLES_DIR/version.txt"
# In addition to the numerical version (e.g. the number of commits),
# it is also handy to have the exact git commit hash for the current build
echo $(git rev-parse HEAD) > "$DIR/../public/js/bundles/git_revision.txt"
rm -f "$COMPILING_FILE"

# Clean up old files in the "bundles" directory
cd "$DIR/../public/js/bundles"
if [[ $(ls | grep -v "main.$VERSION" | grep -v version.txt | grep -v git_revision.txt) ]]; then
  ls | grep -v "main.$VERSION" | grep -v version.txt | grep -v git_revision.txt | xargs rm
  # (we don't use an environment variable to store the results because it will cause the script to
  # stop execution in the case where there are no results)
fi
cd "$DIR"

# Similar to the JavaScript, we need to concatenate all of the CSS into one file before sending it
# to end-users
echo "Packing the CSS using Grunt..."
echo
npx grunt
echo

echo "Client v$VERSION successfully built in $SECONDS seconds."
