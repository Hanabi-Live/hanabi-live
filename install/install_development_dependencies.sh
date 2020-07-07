#!/bin/bash

set -e # Exit on any errors
set -x # Enable debugging

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Install VS Code extensions
EXTENSIONS=$(sed --quiet --regexp-extended --expression 's/^\s*"(.+)".*$/\1/p' "$DIR/../.vscode/extensions.json" | grep -v recommendations)
for EXTENSION in $EXTENSIONS; do
  code --install-extension "$EXTENSION"
done

"$DIR/../client/install_client_linter.sh"
"$DIR/../server/install_server_linter.sh"

echo "Successfully installed development dependencies."
