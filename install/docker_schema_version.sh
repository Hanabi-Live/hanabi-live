#!/usr/bin/env bash

set -euo pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
# shellcheck source=./install/migration_files.sh
source "$DIR/helpers/migration_files.sh"
version="$(get_migration_version "$DIR/helpers/migrations")"
psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --variable=ON_ERROR_STOP=1 --variable=migration_version="$version" \
  --file="$DIR/helpers/schema_version.sql"
