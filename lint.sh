#!/bin/bash

# Prerequisites:
# 1) go get -u github.com/alecthomas/gometalinter
# 2) gometalinter --install

cd "/root/go/src/github.com/Zamiell/hanabi-live/src/"
gometalinter --config=../.gometalinter2.json --deadline=2m ./...
