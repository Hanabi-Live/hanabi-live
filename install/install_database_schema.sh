#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Import the database information.
# shellcheck source=/dev/null
source "$DIR/../.env"

if [[ -z ${DB_HOST-} ]]; then
  DB_HOST=localhost
fi
if [[ -z ${DB_PORT-} ]]; then
  DB_PORT=5432
fi

PGPASSWORD="$DB_PASSWORD" psql \
  --quiet \
  --variable=ON_ERROR_STOP=1 \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  < "$DIR/database_schema.sql"

echo "Successfully installed the database schema."
