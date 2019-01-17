#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Combine, optimize, and minify CSS
python "$DIR/css.py"

# "Browserify" the JavaScript (to convert Node-style imports to compatible browser code)
browserify "$DIR/public/js/src/main.js" --outfile "$DIR/public/js/main.bundled.js" --verbose --debug

# Combine and minify JavaScript
python "$DIR/javascript.py"
