#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the repository
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO="$(basename $DIR)"

# For non-interactive shells, $HOME must be specified or it will result in a cache error when compiling the Go code
export HOME=/root

# Recompile the Golang code and restart the service
cd "$DIR/src"
go install
if [ $? -eq 0 ]; then
    # The binary is called "src" by default, since the directory name is "src"
    mv "$GOPATH/bin/src" "$GOPATH/bin/$REPO"
    supervisorctl restart $REPO
else
    echo "$REPO - Go compilation failed!"
fi
