#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Redirect all output to syslog (but skip this if we are on Windows).
# Otherwise, cron output is silently discarded (no MTA is installed).
# https://www.urbanautomaton.com/blog/2014/09/09/redirecting-bash-script-output-to-syslog/
if uname -a | grep -v MINGW64 > /dev/null 2>&1; then
  exec 1> >(logger -s -t "$(basename "$0")") 2>&1
fi

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

cd "$DIR"

# Renew the Let's Encrypt certificate if it is close to expiring.
#
# When the certificate actually changes, the server must be gracefully restarted
# so that it loads the new certificate (otherwise it keeps serving the old one
# from memory until it expires). That restart is performed by the "renew_hook"
# in the certbot renewal configuration
# (/etc/letsencrypt/renewal/<domain>.conf), so that it fires on any successful
# renewal, regardless of which scheduler triggered it.
certbot renew --webroot --webroot-path "$DIR/letsencrypt"
