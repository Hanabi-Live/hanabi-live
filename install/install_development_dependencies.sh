#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.
set -x # Enable debugging.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Install VS Code extensions
EXTENSIONS=$(sed --quiet --regexp-extended --expression 's/^\s*"(.+)".*$/\1/p' "$DIR/../.vscode/extensions.json" | grep -v recommendations)
for EXTENSION in $EXTENSIONS; do
  code --install-extension "$EXTENSION"
done

# The client linter is installed automatically during an "npm install", which happens automatically
# in the "install_dependencies.sh" script.
# We don't current care about linting Golang, so the below script is commented out.
# "$DIR/../server/install_server_linter.sh"

echo "Successfully installed development dependencies."
