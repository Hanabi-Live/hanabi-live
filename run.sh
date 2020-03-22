#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the repository
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO="$(basename "$DIR")"

# Use "go build" to create a new binary
# We explicitly do not use "go run ." because on Windows,
# Windows Firewall will pop up a new alert every time we want to re-run the server
cd "$DIR/src"
go build -o "$DIR/$REPO"
if [ $? -eq 0 ]; then
    # The build was successful; run the server
    cd "$DIR"
    "$DIR/$REPO"
else
    echo "$REPO - Go compilation failed!"
fi
