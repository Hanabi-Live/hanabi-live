#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the WebPack port
source "$DIR/.env"
if [[ -z $DOMAIN ]]; then
  DOMAIN="localhost"
fi
if [[ -z $WEBPACK_DEV_SERVER_PORT ]]; then
  WEBPACK_DEV_SERVER_PORT=8080
fi

cd "$DIR/client"
npx webpack-dev-server --host "$DOMAIN" --port "$WEBPACK_DEV_SERVER_PORT"
