#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

if [[ $# -ne 1 ]]; then
  echo "usage: $(basename "$0") [filename]"
  exit 1
fi

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Import the database information.
# shellcheck source=/dev/null
source "$DIR/../../.env"
if [[ -z ${DB_HOST-} ]]; then
  DB_HOST=localhost
fi
if [[ -z ${DB_PORT-} ]]; then
  DB_PORT=5432
fi
if [[ -z ${DB_USER-} ]]; then
  echo "Error: You must specify the database username in the \".env\" file."
  exit 1
fi
if [[ -z ${DB_PASSWORD-} ]]; then
  echo "Error: You must specify the database password in the \".env\" file."
  exit 1
fi
if [[ -z ${DB_NAME-} ]]; then
  echo "Error: You must specify the database name in the \".env\" file."
  exit 1
fi

# This assumes that "postgres" and "hanabiuser" share the same password
PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="postgres" << EOF
DROP DATABASE $DB_NAME;
CREATE DATABASE $DB_NAME;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
GRANT USAGE ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
EOF
PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" < "$1"
