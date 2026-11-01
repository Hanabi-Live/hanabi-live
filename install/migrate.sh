#!/usr/bin/env bash

set -euo pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
# shellcheck source=./install/migration_files.sh
source "$DIR/migration_files.sh"

if (($# > 1)); then
  echo "Usage: $0 [status|apply]" >&2
  exit 1
fi
case "${1:-status}" in
  status) command="status" ;;
  apply) command="migrate" ;;
  *)
    echo "Usage: $0 [status|apply]" >&2
    exit 1
    ;;
esac

version="$(get_migration_version "$DIR/migrations")"
if ((version == 0)); then
  echo "No tracked migrations."
  exit 0
fi

# shellcheck source=/dev/null
source "$DIR/../.env"
export PGHOST="${DB_HOST:-localhost}"
export PGPORT="${DB_PORT:-5432}"
export PGUSER="${DB_USER:-hanabiuser}"
export PGPASSWORD="${DB_PASSWORD:-1234567890}"
export PGDATABASE="${DB_NAME:-hanabi}"
export PGCONNECT_TIMEOUT=10
export PGOPTIONS="-c statement_timeout=3600000 -c lock_timeout=5000"

exec go run "github.com/jackc/tern/v2@$TERN_VERSION" "$command" \
  --config="" --migrations "$DIR/migrations" --version-table public.schema_version
