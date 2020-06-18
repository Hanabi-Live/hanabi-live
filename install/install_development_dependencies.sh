#!/bin/bash

set -e # Exit on any errors
set -x # Enable debugging

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the linter version
source "$DIR/../server/.golangci-lint.version"

# Install VS Code extensions
code --install-extension "golang.go" # For Golang
code --install-extension "dbaeumer.vscode-eslint" # For TypeScript

# Install the Golang linter
# (it is not recommended to install this with "go get")
# https://github.com/golangci/golangci-lint#install
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin $GOLANGCI_LINT_VERSION

# Install the TypeScript linter
# https://www.npmjs.com/package/eslint-config-airbnb
cd "$DIR/../client"
npx install-peerdeps --dev eslint-config-airbnb-base

echo "Successfully installed development dependencies."
