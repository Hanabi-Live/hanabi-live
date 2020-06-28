#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the domain and port
source "$DIR/../.env"
if [[ -z $DOMAIN ]]; then
  DOMAIN="localhost"
fi
if [[ -z $PORT ]]; then
  PORT="80"
fi

# Rebuild the critical CSS
cd "$DIR"
npx grunt critical --url="http://$DOMAIN:$PORT"
