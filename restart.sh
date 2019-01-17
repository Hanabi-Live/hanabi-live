#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Recompile the Go code and restart the service
cd "$DIR/src"
go install
if [ $? -eq 0 ]; then
	mv "$GOPATH/bin/src" "$GOPATH/bin/hanabi-live"
	supervisorctl restart hanabi-live
else
	echo "hanabi-live - Go compilation failed!"
fi

# Rebuild the client code
python "$DIR/build_client.py"
