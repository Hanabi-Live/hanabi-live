#!/bin/bash

# Safely updates the server with changes on origin/master in an automated way.
# This is not intended for developers to use: a developer can resolve conflicts.
# Takes no action if there are local changes that would be lost or require a merge.

cd "/root/go/src/github.com/Zamiell/hanabi-live/"
git fetch

# Check if the local state already matches the remote
if [ $(git rev-parse HEAD) = $(git rev-parse origin/master) ]; then
        exit 0
fi

# Fail if the current branch is not master
if [ $(git symbolic-ref --short HEAD) != "master" ]; then
        exit 1
fi

# Check if there are any differences between the contents of local files and origin/master
if git diff origin/master --quiet --exit-code; then
        # Tracked files are identical, so ensure local branch uses the same commit hash
        git reset --hard origin/master
else
        # Merge if all local commits are already on origin/master
        git pull --ff-only
fi
