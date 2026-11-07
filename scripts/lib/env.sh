# Source this file to load the repository's ".env" file. It sets "REPO_ROOT" and applies the
# server's database defaults (see ".env.example").

# This file is sourced, so it must not overwrite the caller's "DIR".
LIB_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "$LIB_DIR/../.." &> /dev/null && pwd)

ENV_PATH="$REPO_ROOT/.env"
if [[ ! -f $ENV_PATH ]]; then
  echo "Failed to find the \".env\" file at: $ENV_PATH" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_PATH"

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-hanabiuser}
DB_PASSWORD=${DB_PASSWORD:-1234567890}
DB_NAME=${DB_NAME:-hanabi}
