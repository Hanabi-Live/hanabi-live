-- Validation scans the table, but it does not block normal reads and writes.
ALTER TABLE chat_log VALIDATE CONSTRAINT chat_log_discord_name_check;
