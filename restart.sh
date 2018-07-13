#!/bin/bash

cd "/root/go/src/github.com/Zamiell/hanabi-live/src"
GOPATH=/root/go /usr/bin/go install
if [ $? -eq 0 ]; then
        mv "/root/go/bin/src" "/root/go/bin/hanabi-live"
        supervisorctl restart hanabi-live
else
        echo "hanabi-live - Go compilation failed!"
fi
