-- Apply before deploying the server code that stores Discord message IDs.
-- Existing messages cannot be backfilled: keep their Discord IDs NULL.
BEGIN;
ALTER TABLE chat_log ADD COLUMN discord_message_id TEXT;
CREATE UNIQUE INDEX chat_log_index_discord_message_id ON chat_log (discord_message_id)
    WHERE discord_message_id IS NOT NULL;
COMMIT;
