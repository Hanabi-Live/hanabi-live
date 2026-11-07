#!/usr/bin/env bash

# Replace a user's password hash. The hash is read from a prompt so that it stays out of the shell
# history and the process list.

set -o errexit -o nounset -o pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $(basename "$0") [username]"
  exit 1
fi
USERNAME=$1

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
# shellcheck source=../lib/database.sh
source "$DIR/../lib/database.sh"

exists=$(sql --set=username="$USERNAME" <<< "SELECT EXISTS (SELECT 1 FROM users WHERE username = :'username');")
if [[ $exists != "t" ]]; then
  echo "The username of \"$USERNAME\" does not exist in the database."
  exit 1
fi

last_ip=$(sql --set=username="$USERNAME" <<< "SELECT last_ip FROM users WHERE username = :'username';")
echo "Their last IP address is: $last_ip"

read -r -p "Enter the password hash: " password_hash
if [[ -z $password_hash ]]; then
  echo "You cannot enter a blank password hash."
  exit 1
fi

# The hash is passed in the environment, not as a psql argument, to keep it out of the process list.
PASSWORD_HASH=$password_hash sql --set=username="$USERNAME" << 'SQL'
\getenv password_hash PASSWORD_HASH
UPDATE users SET password_hash = :'password_hash' WHERE username = :'username';
SQL
echo "Complete."
