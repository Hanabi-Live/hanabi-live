-- no-transaction
-- `table_id` replaced `room`, which the server no longer uses. Dropping the index concurrently
-- does not block writes.
DROP INDEX CONCURRENTLY IF EXISTS chat_log_index_room_datetime_sent_id;
