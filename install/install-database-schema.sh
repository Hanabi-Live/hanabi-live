#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

source "$DIR/migration-files.sh"
migration_version="$(get_migration_version "$DIR/migrations")"

# Import the database information.
# shellcheck source=../scripts/lib/env.sh
source "$DIR/../scripts/lib/env.sh"

PGPASSWORD="$DB_PASSWORD" psql \
  --quiet \
  --variable=ON_ERROR_STOP=1 \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --single-transaction \
  --variable=migration_version="$migration_version" \
  --file="$DIR/database_schema.sql" \
  --file="$DIR/schema_version.sql"

echo "Successfully installed the database schema."
