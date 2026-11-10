#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "$DIR/../.." &> /dev/null && pwd)

# Minify the CSS bundle as the client build does, which fails on any CSS that the minifier cannot
# parse.
OUTPUT=$(mktemp)
trap 'rm -f "$OUTPUT"' EXIT
bun "$REPO_ROOT/packages/scripts/src/buildCSS.mts" "$OUTPUT"

CSS_DIR="$REPO_ROOT/public/css"
TOKENS="$CSS_DIR/tokens.css"
STYLESHEETS=("$CSS_DIR/defaults.css" "$CSS_DIR"/app/*.css "$CSS_DIR/overrides.css")

# The dark theme only changes the values of the variables in "tokens.css", so that each rule has
# one set of colors for both themes.
if grep -n "data-theme" "${STYLESHEETS[@]}"; then
  echo 'Error: Set dark theme colors as variables in "public/css/tokens.css", instead of in a rule for "[data-theme]".' >&2
  exit 1
fi

# Media queries, including the Tailwind variants of the React components, use only the breakpoints
# that "tokens.css" lists.
TAILWIND="$REPO_ROOT/packages/client/src/tailwind.css"
for DIMENSION in max-width max-height; do
  ALLOWED=$(grep -E "^\s*\"$DIMENSION\":" "$TOKENS" | grep -oE "[0-9]+px" || true)
  if [[ -z $ALLOWED ]]; then
    echo "Error: \"public/css/tokens.css\" does not list the \"$DIMENSION\" breakpoints." >&2
    exit 1
  fi
  while read -r VALUE; do
    if ! grep -qx "$VALUE" <<< "$ALLOWED"; then
      echo "Error: A media query uses \"$DIMENSION: $VALUE\", which is not a breakpoint in \"public/css/tokens.css\"." >&2
      exit 1
    fi
  done < <(grep -ohE "\($DIMENSION: [0-9]+px\)" "${STYLESHEETS[@]}" "$TAILWIND" | grep -oE "[0-9]+px" | sort -u)
done

# Class and ID names use kebab case, such as ".lobby-row". Prettier puts each selector on its own
# line, which ends with "{" or ",", so only those lines are checked.
if grep -nE "[,{]\s*$" "$TOKENS" "${STYLESHEETS[@]}" | grep -E "[.#][-_a-zA-Z0-9]*[A-Z_]"; then
  echo "Error: Use kebab case for class and ID names, such as \".lobby-row\"." >&2
  exit 1
fi

# Pseudo-elements use two colons, such as "::before", so that they look different from
# pseudo-classes.
if grep -nE "(^|[^:]):(before|after|first-line|first-letter)\b" "${STYLESHEETS[@]}"; then
  echo 'Error: Write pseudo-elements with two colons, such as "::before".' >&2
  exit 1
fi
