#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Import the certificate location.
ENV_PATH="$DIR/.env"
if [[ ! -f $ENV_PATH ]]; then
  echo "Failed to find the \".env\" file at: $ENV_PATH"
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_PATH"
if [[ -z ${TLS_CERT_FILE-} ]]; then
  echo "Failed to find the value for \"TLS_CERT_FILE\" file at: $ENV_PATH"
  exit 1
fi

CERT_HASH_BEFORE=$(md5sum "$TLS_CERT_FILE" | awk '{ print $1 }')

cd "$DIR"
certbot renew --webroot --webroot-path "$DIR/letsencrypt"

CERT_HASH_AFTER=$(md5sum "$TLS_CERT_FILE" | awk '{ print $1 }')

if [[ "$CERT_HASH_BEFORE" != "$CERT_HASH_AFTER" ]]; then
  echo "The certificate has changed. Gracefully restarting the server."
  bash "$DIR/admin/gracefulRestart.sh"
else
  echo "The certificate has not changed."
fi
