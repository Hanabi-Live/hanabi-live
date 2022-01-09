#!/bin/bash

set -e # Exit on any errors

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

$DIR/node_modules/.bin/depcruise \
    --include-only "^src/" \
    --exclude "client_v2" \
    --output-type dot \
    --ts-pre-compilation-deps \
    --ts-config $DIR/tsconfig.json \
    $DIR/src \
    | dot -T svg \
    | depcruise-wrap-stream-in-html \
    > graph.html

start ./graph.html