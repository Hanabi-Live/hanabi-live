#!/bin/bash

# Set the version number in the "version.json" file
# (which is equal to the number of commits in the git repository)
# This is "baked" into the JavaScript bundle and self-reported when connecting to the server so that
# the server can deny clients on old versions of the code
VERSION=$(git rev-list --count HEAD)
echo "$VERSION" > "$DIR/../data/version.json"
