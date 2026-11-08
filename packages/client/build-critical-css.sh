#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Import the domain and port
# shellcheck source=../../scripts/lib/env.sh
source "$DIR/../../scripts/lib/env.sh"
if [[ -z ${DOMAIN-} ]]; then
  DOMAIN="localhost"
fi
if [[ -z ${PORT-} ]]; then
  PORT="80"
fi
if [[ -n ${TLS_CERT_FILE-} ]]; then
  echo "A production environment has been detected. You cannot build critical CSS in production. Instead, run this script on a local development server and push the changes to the git repository."
  exit 1
fi

URL="http://$DOMAIN:$PORT"

# Test to see if the server is running
if ! curl --silent --fail --show-error --location "$URL" > /dev/null; then
  echo "You must ensure that the server is running before running this script."
  exit 1
fi

# Get the "VERSION" environment variable.
# shellcheck disable=SC1091
source "$DIR/get-version.sh"

# Rebuild the critical CSS from the CSS bundle.
BUILD_CSS="$DIR/../scripts/src/buildCSS.mts"
cd "$DIR"
bun "$BUILD_CSS" "$DIR/../../public/css/main.$VERSION.min.css"
# PhantomJS cannot read the OpenSSL configuration of current systems, so it gets none.
OPENSSL_CONF=/dev/null bunx --bun --no-install grunt critical --url="$URL"
bun "$BUILD_CSS" --critical
echo "Remember to commit the \"critical.min.css\" file if it had any changes."
