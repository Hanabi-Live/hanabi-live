#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Configuration
TABLE_NAME="game_actions"

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# shellcheck source=../lib/env.sh
source "$DIR/../lib/env.sh"

PGPASSWORD="$DB_PASSWORD" pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" --format plain --verbose --file "/tmp/$TABLE_NAME.sql" --table="$TABLE_NAME"
