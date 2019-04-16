#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Set the version number in the "globals.js" file
# (which is equal to the number of commits in the git repository)
VERSION=$(git rev-list --count HEAD)
printf "module.exports = $VERSION;\n" > "$DIR/public/js/src/version.js"

# If we need to, add the NPM directory to the path
# (the Golang process will execute this script on a graceful shutdown
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

# Run the Grunt runner to prepare the JavaScript and the CSS
cd "$DIR/public/js"
npx grunt
