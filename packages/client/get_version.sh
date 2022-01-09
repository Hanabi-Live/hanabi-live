#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

REPO_ROOT="$DIR/../.."

cd "$REPO_ROOT"

# Set the version number in the "version.json" file
# (which is equal to the number of commits in the git repository)
# This is "baked" into the JavaScript bundle and self-reported when connecting to the server so that
# the server can deny clients on old versions of the code
# This must be in the form of CommonJS JavaScript code because it is imported from the webpack
# config, which is written in JavaScript (instead of TypeScript)
VERSION=$(git rev-list --count HEAD)
