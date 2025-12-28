#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

cd "$DIR"

find . \( -name "node_modules" -o -name ".husky" \) -prune -o -type f -name "*.sh" -exec shellcheck {} +
