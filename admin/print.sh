#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the script and trim the ".sh"
COMMAND=$(basename "$0" | cut -f 1 -d '.')

source "$DIR/common.sh"
admin_command "$COMMAND"
