#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# https://github.com/zirkelc/git-pull-run
npx git-pull-run --pattern "package-lock.json" --command "npm ci"
