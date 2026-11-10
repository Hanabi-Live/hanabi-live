-- The table whose chat a message belongs to, or NULL for the lobby. It will replace `room`, which
-- stores "lobby" or "table" followed by the table's ID.
ALTER TABLE chat_log ADD COLUMN table_id BIGINT;
