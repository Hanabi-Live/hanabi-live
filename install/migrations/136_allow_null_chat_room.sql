-- The server no longer writes `room`, which `table_id` replaced. A later release drops it.
ALTER TABLE chat_log ALTER COLUMN room DROP NOT NULL;
