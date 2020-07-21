#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the website information
source "$DIR/../../.env"

URL_PREFIX="https"
WS_PREFIX="wss"
if [[ -z $TLS_CERT_FILE ]]; then
  URL_PREFIX="http"
  WS_PREFIX="ws"
fi
URL="$URL_PREFIX://$DOMAIN:$PORT/login"
WEBSOCKET_URL="$WS_PREFIX://$DOMAIN:$PORT/ws"
WEBSOCKET_URL="$WS_PREFIX://$DOMAIN:$PORT/ws"

echo "Getting a cookie..."
echo curl --verbose --dump-header "cookie.txt" --data "username=test&password=test&version=bot" "$URL"
curl --verbose --dump-header "cookie.txt" --data "username=test&password=test&version=bot" "$URL"
echo

COOKIE=$(grep -i 'Set-Cookie' cookie.txt | awk '/hanabi.sid=/{print $2}')
HTTP_HEADER="Cookie: $COOKIE"

echo "Connecting to the WebSocket server..."
echo wscat --header "$HTTP_HEADER" --connect "$WEBSOCKET_URL"
wscat --header "$HTTP_HEADER" --connect "$WEBSOCKET_URL"
