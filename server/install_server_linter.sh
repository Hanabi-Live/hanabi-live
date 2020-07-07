#!/bin/bash

# Configuration
GOLANGCI_LINT_VERSION="v1.27.0"

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Install the Golang linter
# (it is not recommended to install this with "go get")
# https://github.com/golangci/golangci-lint#install
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin $GOLANGCI_LINT_VERSION
