#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Set the version number in the "globals.js" file
# (which is equal to the number of commits in the git repository)
VERSION=$(git rev-list --count HEAD)
sed --in-place "s/const version = [[:digit:]]\+;/const version = $VERSION;/g" "$DIR/public/js/src/globals.js"

# Add the NPM directory to the path
NODE_VERSION_DIRS=(/root/.nvm/versions/node/*)
NPM_BIN_DIR=${NODE_VERSION_DIRS[-1]}/bin
export PATH=$NPM_BIN_DIR:$PATH

# Run the Grunt runner to prepare the JavaScript and the CSS
cd "$DIR/public/js"
npx grunt
