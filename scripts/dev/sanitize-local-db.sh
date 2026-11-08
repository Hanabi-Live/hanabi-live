#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# shellcheck source=../lib/env.sh
source "$DIR/../lib/env.sh"

# Tables not cleared (users and games are anonymized instead):
# - users
# - games
# - game_participants
# - game_actions
# - seeds

PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" --set=ON_ERROR_STOP=1 --single-transaction << EOF
TRUNCATE
  user_stats,
  user_friends,
  user_linkages,
  user_blocks,
  user_identity_tokens,
  game_participant_notes,
  game_tags,
  variant_stats,
  chat_log,
  chat_log_pm,
  banned_ips,
  muted_ips;
UPDATE users SET
  username = CONCAT('anon_user_', id),
  normalized_username = CONCAT('anon_user_', id),
  password_hash = NULL,
  last_ip = '',
  datetime_created = NOW(),
  datetime_last_login = NOW(),
  settings = '{}';
UPDATE games SET name = CONCAT('Game ', id);
EOF
