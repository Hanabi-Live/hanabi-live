#!/bin/bash

# Requirements:
# npm install -g wscat

# Configuration
HANABI_USERNAME="test"
HANABI_PASSWORD="test"

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
COOKIE_FILENAME="cookie.txt"
echo curl --verbose --dump-header "$COOKIE_FILENAME" --data "username=$HANABI_USERNAME&password=$HANABI_PASSWORD&version=bot" "$URL"
curl --verbose --dump-header "$COOKIE_FILENAME" --data "username=$HANABI_USERNAME&password=$HANABI_PASSWORD&version=bot" "$URL"
COOKIE=$(grep -i 'Set-Cookie' "$COOKIE_FILENAME" | awk '/hanabi.sid=/{print $2}')
HTTP_HEADER="Cookie: $COOKIE"
rm -f "$COOKIE_FILENAME"

echo
echo "Connecting to the WebSocket server..."
echo wscat --header "$HTTP_HEADER" --connect "$WEBSOCKET_URL"
wscat --header "$HTTP_HEADER" --connect "$WEBSOCKET_URL"
