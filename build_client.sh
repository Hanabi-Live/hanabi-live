#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Record the starting time
START_TIME=`date +%s`

# Create a file that informs the server that the compiled JavaScript will not be available for the
# next few seconds
COMPILING_FILE="$DIR/compiling_client"
touch "$COMPILING_FILE"

# Set the version number in the "version.ts" file
# (which is equal to the number of commits in the git repository)
VERSION=$(git rev-list --count HEAD)
echo "$VERSION" > "$DIR/public/js/src/data/version.json"

# If we need to, add the NPM directory to the path
# (the Golang process will execute this script during a graceful restart
# and it will not have it in the path by default)
if ! command -v npx > /dev/null; then
  # MacOS only has Bash version 3, which does not have assosiative arrays,
  # so the below check will not work
  # https://unix.stackexchange.com/questions/92208/bash-how-to-get-the-first-number-that-occurs-in-a-variables-content
  BASH_VERSION_FIRST_DIGIT=$(bash --version | grep -o -E '[0-9]+' | head -1 | sed -e 's/^0\+//')
  if [ "$BASH_VERSION_FIRST_DIGIT" -lt "4" ]; then
    echo "Failed to find the \"npx\" binary (on bash version $BASH_VERSION_FIRST_DIGIT)."
    exit 1
  fi

  # Assume that Node Version Manager is being used on this system
  # https://github.com/creationix/nvm
  NODE_VERSION_DIRS=(/root/.nvm/versions/node/*)
  NODE_VERSION_DIR="${NODE_VERSION_DIRS[-1]}"
  if [ ! -d "$NODE_VERSION_DIR" ]; then
    echo "Failed to find the \"npx\" binary (in the \"/root/.nvm/versions/node\" directory)."
    exit 1
  fi
  NPM_BIN_DIR="$NODE_VERSION_DIR/bin"
  export PATH=$NPM_BIN_DIR:$PATH
fi

cd "$DIR/public/js"

echo "Packing the TypeScript using WebPack..."
echo
npx webpack # Pack the TypeScript into one file

echo
echo "Packing the CSS using Grunt..."
echo
npx grunt # Pack the CSS into one file
rm -f "$COMPILING_FILE"

# Calculate how much time it took to build the client
END_TIME=`date +%s`
ELAPSED_SECONDS=$((END_TIME-START_TIME))
echo
echo "Client v$VERSION successfully built in $ELAPSED_SECONDS seconds."
