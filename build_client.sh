#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Add the NPM directory to the path
VERSION_DIRS=(/root/.nvm/versions/node/*)
NPM_BIN_DIR=${VERSION_DIRS[-1]}/bin
export PATH=$NPM_BIN_DIR:$PATH

# Run the Grunt runner to prepare the JavaScript and the CSS
cd "$DIR/public/js"
npx grunt
