#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the localhost port
source "$DIR/../.env"
if [ -z "$LOCALHOST_PORT" ]; then
    LOCALHOST_PORT=8081
fi

if [ $# -eq 0 ]; then
    echo "usage: `basename "$0"` [username] [msg]"
    exit 1
fi

curl --silent "http://localhost:$LOCALHOST_PORT/sendError/$1" --data "msg=$2"
