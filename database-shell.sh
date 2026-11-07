#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# shellcheck source=scripts/lib/env.sh
source "$DIR/scripts/lib/env.sh"

if uname -a | grep MINGW64 > /dev/null 2>&1; then
  echo "Error: PostgreSQL shells do not work inside of Git Bash. Use the Windows Command Prompt instead."
  exit 1
fi

# Open a database shell.
PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME"
