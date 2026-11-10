-- no-transaction
-- chat_log_index_lobby_datetime_sent_id replaced this index. Dropping it concurrently does not
-- block writes.
DROP INDEX CONCURRENTLY IF EXISTS chat_log_index_lobby;
