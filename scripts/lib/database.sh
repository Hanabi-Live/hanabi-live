# Source this file to query the database in the repository's ".env" file. "sql" passes its
# arguments to psql and prints rows without headers or alignment. Pass values with
# "--set=name=value" and refer to them as :'name' in SQL read from standard input, so that psql
# quotes them.

# shellcheck source=env.sh
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)/env.sh"

function sql {
  PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
    --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 "$@"
}
