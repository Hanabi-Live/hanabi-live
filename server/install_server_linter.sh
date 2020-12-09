#!/bin/bash

# Configuration
GOLANGCI_LINT_VERSION="v1.33.0" # Current as of Dec. 2020

# Install the Golang linter
# (it is not recommended to install this with "go get")
# https://github.com/golangci/golangci-lint#install
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin "$GOLANGCI_LINT_VERSION"
