#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

REPO_ROOT="$DIR/../.."

# Set the version number in the "version.json" file
# (which is equal to the number of commits in the git repository)
# This is "baked" into the JavaScript bundle and self-reported when connecting to the server so that
# the server can deny clients on old versions of the code
cd "$REPO_ROOT"
VERSION=$(git rev-list --count HEAD)
echo "$VERSION" > "$REPO_ROOT/data/version.json"
