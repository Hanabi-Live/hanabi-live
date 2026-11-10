-- no-transaction
-- The lobby's chat in the order that its history and Discord read it. It holds a few thousand of
-- the 32 million rows. Building it reads the whole table without blocking writes. If the build
-- fails, it leaves an invalid index: drop it with `DROP INDEX CONCURRENTLY
-- chat_log_index_lobby_datetime_sent_id` before applying the migrations again.
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_log_index_lobby_datetime_sent_id
    ON chat_log (datetime_sent, id) WHERE table_id IS NULL;
