# AGENTS.md

## Configuration and customization

Do not add environment variables, configuration options, or customization unless
they are absolutely necessary or there is a strong, concrete reason. Prefer a
simple, documented behavior over speculative flexibility. When a new option is
justified, explain the use case and why a fixed behavior is insufficient.

## Documentation

Do not document every small change or implementation detail. Add or update
documentation only for essential instructions, significant decisions, or
non-obvious constraints. Keep it concise and relevant to the document's purpose;
do not put unrelated operational details in installation instructions.

## Production server

The production server is `root@hanab.live`, with the repository at
`~/hanabi-live`. The server log is at `~/hanabi-live/logs/hanabi-live.log` (use
`./get-log.sh` to download it).

### Deploying

1. Pull the latest code on the server: `git pull`
1. Apply pending SQL migrations: `./install/migrate.sh apply`.
1. Gracefully restart the server:

   ```sh
   curl http://127.0.0.1:${LOCALHOST_PORT:-8081}/gracefulRestart
   ```

   This builds the client and the server, checkpoints ongoing games, warns
   players, and restarts. The games are restored when the server starts back up.
   Check the log afterward for the "successfully started" message and for
   errors.

**Never use `supervisorctl restart` or `supervisorctl stop` (or
`restart_service_only.sh`) on a running server.** Signals bypass command
draining and orderly finalization; continuous recovery is not a replacement for
maintenance shutdown. Use `/gracefulRestart` to restart or `/shutdown` to stop.
`supervisorctl start` is only appropriate when the server is already stopped.

### Database migrations

Use `./install/migrate.sh status` to inspect migration state and
`./install/migrate.sh apply` to apply pending migrations before restarting. The
runner uses pinned Tern and the project's Go 1.27 toolchain, and reuses the
existing `.env` database settings. It does not apply migrations during server
startup.

Before migration `003_reserved_game_ids.sql`, finish games and resolve saved
snapshots from the intermediate UUID-based server. It removes that column and
index; those snapshots cannot be restored afterward. Original unversioned
snapshots are upgraded automatically. Do not roll back to a server without
reserved-ID support while such games are in progress.

Migration `004_active_games.sql` is required for continuous game recovery. Do
not roll back to a binary without active-game recovery while checkpoints exist.
PostgreSQL checkpoints supersede flat snapshots and survive restoration. The
retired `/saveTables` endpoint returns HTTP 410 without saving anything; use
`/gracefulRestart`, which checkpoints the active timed player's 20-second
maintenance allowance once. Crash restoration does not grant additional time. A
failed or uncertain checkpoint freezes only that table until server recovery.
Keep using graceful restart, including when recovering frozen tables.

Keep migration files numbered consecutively from `001_name.sql`. Applied
migrations are immutable: do not edit or delete them. Use forward migrations
only, without a down-migration section. Update `install/database_schema.sql` in
the same change; fresh installations record the version already represented by
that complete schema.

Migrations normally run in transactions. Operations such as concurrent index
creation require `---- tern: disable-tx ----` and must be designed for safe
recovery after partial failure.

Some tables, such as `chat_log` (~90 million rows), are very large:

- Adding a nullable column, or a column with a constant default, is instant and
  safe to run while the server is online.
- An `UPDATE` of every row takes a long time, roughly doubles the table's disk
  usage, and (when combined with `ALTER TABLE` in one transaction) locks the
  table for the whole duration. Instead, backfill in small batches by ID range
  with `VACUUM` in between, while the server is online.
- Add `CHECK` constraints with `NOT VALID` and then `VALIDATE CONSTRAINT`, which
  does not block reads or writes.
