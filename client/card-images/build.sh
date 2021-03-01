#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

rm -rf "$DIR/dist"
npx tsc
cp "$DIR/canvas2svg_node.js" "$DIR/dist/client/card-images/"
cd "$DIR/dist/client/card-images/"
npm i xmlserializer
mkdir "$DIR/dist/client/card-images/cards"
