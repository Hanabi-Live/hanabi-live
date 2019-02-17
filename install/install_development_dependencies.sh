#!/bin/bash

set -e # Exit on any errors
set -x # Enable debugging

# This is the directory that this script lives in
# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Install VS Code extensions
code --install-extension "ms-vscode.Go" # For Golang
code --install-extension "dbaeumer.vscode-eslint" # For JavaScript

# Install the Golang tools that VSCode uses
# From: https://github.com/Microsoft/vscode-go/wiki/Go-tools-that-the-Go-extension-depends-on
go get -u -v github.com/ramya-rao-a/go-outline
go get -u -v github.com/acroca/go-symbols
go get -u -v github.com/mdempsky/gocode
go get -u -v github.com/rogpeppe/godef
go get -u -v golang.org/x/tools/cmd/godoc
go get -u -v github.com/zmb3/gogetdoc
go get -u -v golang.org/x/lint/golint
go get -u -v github.com/fatih/gomodifytags
go get -u -v golang.org/x/tools/cmd/gorename
go get -u -v sourcegraph.com/sqs/goreturns
go get -u -v golang.org/x/tools/cmd/goimports
go get -u -v github.com/cweill/gotests/...
go get -u -v golang.org/x/tools/cmd/guru
go get -u -v github.com/josharian/impl
go get -u -v github.com/haya14busa/goplay/cmd/goplay
go get -u -v github.com/uudashr/gopkgs/cmd/gopkgs
go get -u -v github.com/davidrjenni/reftools/cmd/fillstruct
go get -u -v github.com/alecthomas/gometalinter

# Install the Golang linter
go get -u -v "github.com/golangci/golangci-lint/cmd/golangci-lint"

# Install the JavaScript linter
cd "$DIR/../public/js"
npx install-peerdeps --dev eslint-config-airbnb-base
