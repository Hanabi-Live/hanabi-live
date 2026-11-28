#!/usr/bin/env bash

# Remove the IP bans that were made for a user, and the ban on the user's last IP address.

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

# A ban records the IP address that the user had at that time, which can differ from the last one.
removed=$(
  sql --set=username="$USERNAME" << 'SQL'
DELETE FROM banned_ips USING users
WHERE users.username = :'username' AND (banned_ips.user_id = users.id OR banned_ips.ip = users.last_ip)
RETURNING banned_ips.ip;
SQL
)
if [[ -z $removed ]]; then
  echo "The user \"$USERNAME\" has no bans, and the IP address of \"$last_ip\" is not banned."
  exit 1
fi
echo "Removed the bans on these IP addresses:"
echo "$removed"
