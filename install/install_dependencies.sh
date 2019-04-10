#!/bin/bash

set -e # Exit on any errors
set -x # Enable debugging

# This is the directory that this script lives in
# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Ensure that the ".env" file exists
if [ ! -f "$DIR/../.env" ]; then
    cp "$DIR/../.env_template" "$DIR/../.env"
fi

# Install the Golang dependencies for the project
cd "$DIR/../src"
go get -u -v ./...

# Install the JavaScript dependencies
cd "$DIR/../public/js"
npm install

# Build the client code
"$DIR/../build_client.sh"
