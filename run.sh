#!/bin/bash

cd "$GOPATH/src/github.com/Zamiell/hanabi-live/src"
go install
if [ $? -eq 0 ]; then
	mv "$GOPATH/bin/src" "$GOPATH/bin/hanabi-live"
else
	echo "hanabi-live - Go compilation failed!"
fi
cd ..
"$GOPATH/bin/hanabi-live"
