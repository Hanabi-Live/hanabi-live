#!/usr/bin/env bash

# Rename a user. Only ASCII usernames are supported, which the server normalizes by lowercasing.

set -o errexit -o nounset -o pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $(basename "$0") [username] [new username]"
  exit 1
fi
USERNAME=$1
NEW_USERNAME=$2

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
# shellcheck source=../scripts/lib/database.sh
source "$DIR/../scripts/lib/database.sh"

if [[ -z $NEW_USERNAME ]]; then
  echo "You cannot enter a blank username."
  exit 1
fi
if LC_ALL=C grep -q '[^ -~]' <<< "$NEW_USERNAME"; then
  echo "The username of \"$NEW_USERNAME\" contains non-ASCII characters. Transliteration to ASCII is required; see server/src/accounts/normalization.rs."
  exit 1
fi
NEW_NORMALIZED=$(tr '[:upper:]' '[:lower:]' <<< "$NEW_USERNAME")

exists=$(sql --set=username="$USERNAME" <<< "SELECT EXISTS (SELECT 1 FROM users WHERE username = :'username');")
if [[ $exists != "t" ]]; then
  echo "The username of \"$USERNAME\" does not exist in the database."
  exit 1
fi

last_ip=$(sql --set=username="$USERNAME" <<< "SELECT last_ip FROM users WHERE username = :'username';")
echo "Their last IP address is: $last_ip"

taken=$(sql --set=normalized="$NEW_NORMALIZED" <<< "SELECT EXISTS (SELECT 1 FROM users WHERE normalized_username = :'normalized');")
if [[ $taken == "t" ]]; then
  echo "The normalized username of \"$NEW_NORMALIZED\" already exists in the database, so you cannot rename someone else to that username."
  exit 1
fi

sql --set=username="$USERNAME" --set=new_username="$NEW_USERNAME" --set=normalized="$NEW_NORMALIZED" << 'SQL'
UPDATE users SET (username, normalized_username) = (:'new_username', :'normalized')
WHERE username = :'username';
SQL
echo "Complete."
