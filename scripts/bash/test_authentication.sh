#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the website information
source "$DIR/../../.env"

URL_PREFIX="https"
if [[ -z $TLS_CERT_FILE ]]; then
  URL_PREFIX="http"
fi
URL="$URL_PREFIX://$DOMAIN:$PORT/login"

curl --verbose --data "username=test&password=test&version=bot" "$URL"
echo
