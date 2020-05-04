#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the database username and password
source "$DIR/.env"

if uname -a | grep MINGW64 >/dev/null 2>&1; then
  echo "Error: PostgreSQL shells do not work inside of Git Bash. Use the Windows Command Prompt instead."
  exit 1
fi

# Open a database shell
if id "postgres" >/dev/null 2>&1; then
  # Linux
  sudo -u postgres psql hanabi
else
  # MacOS
  PGPASSWORD="$DB_PASS" psql -U "$DB_USER" "$DB_NAME"
fi
