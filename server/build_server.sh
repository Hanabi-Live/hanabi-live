#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the repository
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO="$(dirname "$DIR")"
REPO="$(basename "$REPO")"

# For non-interactive shells (e.g. the server running this script to build itself),
# the "HOME" environment variable must be specified or there will be a cache error when compiling
# the Go code (but don't do this in Travis, since doing this will cause it to break)
if [[ -z $HOME ]] && [[ -z $CI ]]; then
  export HOME=/root
fi

# Import the domain
if [[ -z $CI ]]; then
  ENV_PATH="$DIR/../.env"
  if [[ ! -f $ENV_PATH ]]; then
    echo "Failed to find the \".env\" file at: $ENV_PATH"
    exit 1
  fi
  source "$ENV_PATH"
  if [[ -z $DOMAIN ]]; then
    DOMAIN="localhost"
  fi
fi

# Compile the Golang code
cd "$DIR/src"
if [[ $DOMAIN == "localhost" ]]; then
  # In development environments, turn on the Go race condition detector
  # https://blog.golang.org/race-detector
  go build -o "$DIR/../$REPO" -race
else
  go build -o "$DIR/../$REPO" -race
fi
if [[ $? -ne 0 ]]; then
  echo "$REPO - Go compilation failed!"
  exit 1
fi
echo "$REPO - Go compilation succeeded."
