#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $(basename "$0") [filename]"
  exit 1
fi

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# shellcheck source=../lib/database.sh
source "$DIR/../lib/database.sh"

# Empty the database. The database user owns the database, so it can replace the "public" schema.
# It then owns the new schema, so it needs no grants.
sql --command="DROP SCHEMA public CASCADE" --command="CREATE SCHEMA public"
PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" < "$1"
