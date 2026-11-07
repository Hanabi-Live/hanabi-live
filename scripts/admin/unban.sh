#!/usr/bin/env bash

# Remove the IP ban on a user's last IP address.

set -o errexit -o nounset -o pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $(basename "$0") [username]"
  exit 1
fi
USERNAME=$1

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
# shellcheck source=../scripts/lib/database.sh
source "$DIR/../scripts/lib/database.sh"

exists=$(sql --set=username="$USERNAME" <<< "SELECT EXISTS (SELECT 1 FROM users WHERE username = :'username');")
if [[ $exists != "t" ]]; then
  echo "The username of \"$USERNAME\" does not exist in the database."
  exit 1
fi

last_ip=$(sql --set=username="$USERNAME" <<< "SELECT last_ip FROM users WHERE username = :'username';")
echo "Their last IP address is: $last_ip"

deleted=$(sql --set=ip="$last_ip" <<< "WITH deleted AS (DELETE FROM banned_ips WHERE ip = :'ip' RETURNING 1) SELECT COUNT(*) FROM deleted;")
if ((deleted == 0)); then
  echo "The IP address of \"$last_ip\" is not banned."
  exit 1
fi
echo "Complete."
