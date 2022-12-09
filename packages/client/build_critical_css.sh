#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the domain and port
ENV_PATH="$DIR/../../.env"
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
if [[ ! -z $TLS_CERT_FILE ]]; then
  echo "A production environment has been detected. You cannot build critical CSS in production. Instead, run this script on a local development server and push the changes to the git repository."
  exit 1
fi

# Rebuild the critical CSS
cd "$DIR"
npx grunt critical --url="http://$DOMAIN:$PORT"
