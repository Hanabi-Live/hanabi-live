-- no-transaction
-- The lobby's chat, which has no table, for the lobby's history and Discord. It holds a few
-- thousand of the 32 million rows. Building it reads the whole table without blocking writes. If
-- the build fails, it leaves an invalid index: drop it with `DROP INDEX CONCURRENTLY
-- chat_log_index_lobby` before applying the migrations again.
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_log_index_lobby ON chat_log (id) WHERE table_id IS NULL;
