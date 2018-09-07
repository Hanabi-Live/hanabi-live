#!/bin/bash

cd "/root/go/src/github.com/Zamiell/hanabi-live/"
git fetch

if [ $(git rev-parse HEAD) = $(git rev-parse origin/master) ]; then
        exit 0
fi

if [ $(git symbolic-ref --short HEAD) != "master" ]; then
        exit 1
fi

if git diff origin/master --quiet --exit-code; then
        git reset --hard origin/master
else
        git pull --ff-only
fi
