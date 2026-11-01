# AGENTS.md

## Configuration and customization

Do not add environment variables, configuration options, or customization unless
they are absolutely necessary or there is a strong, concrete reason. Prefer a
simple, documented behavior over speculative flexibility. When a new option is
justified, explain the use case and why a fixed behavior is insufficient.

## Production server

The production server is `root@hanab.live`, with the repository at
`~/hanabi-live`. The server log is at `~/hanabi-live/logs/hanabi-live.log` (use
`./get-log.sh` to download it).

### Deploying

1. Pull the latest code on the server: `git pull`
1. Apply any new SQL migrations in `install/migrations/` (see below).
1. Gracefully restart the server:

   ```sh
   curl http://127.0.0.1:${LOCALHOST_PORT:-8081}/gracefulRestart
   ```

   This builds the client and the server, saves all ongoing games to disk, warns
   players, and restarts. The games are restored when the server starts back up.
   Check the log afterward for the "successfully started" message and for
   errors.

**Never use `supervisorctl restart` or `supervisorctl stop` (or
`restart_service_only.sh`) on a running server.** The server does not save
ongoing games when it receives a signal, so every game in progress is lost. Use
`/gracefulRestart` to restart or `/shutdown` to stop. `supervisorctl start` is
only appropriate when the server is already stopped.

### Database migrations

Migrations are not tracked or applied automatically, so check `git log` for new
files in `install/migrations/` since the last deploy. New server code will fail
(and may crash-loop) if a migration it depends on has not been applied. Run a
migration with (replacing the filename):

```sh
(source .env && PGPASSWORD="$DB_PASSWORD" psql --host="${DB_HOST:-localhost}" --port="${DB_PORT:-5432}" --username="$DB_USER" --dbname="$DB_NAME" -v ON_ERROR_STOP=1 -f install/migrations/example.sql)
```

Some tables, such as `chat_log` (~90 million rows), are very large:

- Adding a nullable column, or a column with a constant default, is instant and
  safe to run while the server is online.
- An `UPDATE` of every row takes a long time, roughly doubles the table's disk
  usage, and (when combined with `ALTER TABLE` in one transaction) locks the
  table for the whole duration. Instead, backfill in small batches by ID range
  with `VACUUM` in between, while the server is online.
- Add `CHECK` constraints with `NOT VALID` and then `VALIDATE CONSTRAINT`, which
  does not block reads or writes.
