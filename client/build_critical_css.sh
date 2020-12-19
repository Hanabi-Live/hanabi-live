#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the domain and port
ENV_PATH="$DIR/../.env"
if [[ ! -f $ENV_PATH ]]; then
  echo "Failed to find the \".env\" file at: $ENV_PATH"
  exit 1
fi
source "$ENV_PATH"
if [[ -z $DOMAIN ]]; then
  DOMAIN="localhost"
fi
if [[ -z $PORT ]]; then
  PORT="80"
fi

# Rebuild the critical CSS
cd "$DIR"
npx grunt critical --url="http://$DOMAIN:$PORT"
