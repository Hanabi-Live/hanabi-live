#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the repository
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO="$(dirname "$DIR")"
REPO="$(basename "$REPO")"

# For non-interactive shells (e.g. the server running this script to build itself),
# $HOME must be specified or it will result in a cache error when compiling the Go code
# (but don't do this in Travis, since doing this will cause it to break)
if [[ -z $CI ]]; then
  export HOME=/root
fi

# Compile the Golang code
cd "$DIR/src"
go build -o "$DIR/../$REPO"
if [[ $? -ne 0 ]]; then
  echo "$REPO - Go compilation failed!"
  exit 1
fi
echo "$REPO - Go compilation succeeded."
