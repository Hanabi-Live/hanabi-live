-- Apply after chat_log_discord_message_id.sql and before deploying Discord delete handlers.
-- Existing messages remain visible; only new deletion events create tombstones.
BEGIN;
ALTER TABLE chat_log ADD COLUMN deleted_at TIMESTAMPTZ;
COMMIT;
