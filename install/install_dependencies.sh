#!/bin/bash

set -e # Exit on any errors
set -x # Enable debugging

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Ensure that the ".env" file exists
if [[ ! -f "$DIR/../.env" ]]; then
  cp "$DIR/../.env_template" "$DIR/../.env"
fi

# Install the JavaScript/TypeScript dependencies and build the client
cd "$DIR/../client"
npm install
"$DIR/../client/build_client.sh"

# Build the server, which will automatically install the Golang dependencies
"$DIR/../server/build_server.sh"

echo "Successfully installed dependencies."
