#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
# shellcheck source=migration-files.sh
source "$DIR/helpers/migration-files.sh"
version="$(get_migration_version "$DIR/helpers/migrations")"
psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --variable=ON_ERROR_STOP=1 --variable=migration_version="$version" \
  --file="$DIR/helpers/schema_version.sql"
