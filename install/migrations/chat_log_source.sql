-- Apply to an existing database after stopping old servers and before deploying new ones.
-- Old server versions omit source on INSERT and will fail after this migration.
-- Keep user_id unchanged: old chat rows must survive account deletion.
BEGIN;
ALTER TABLE chat_log ADD COLUMN source TEXT;
UPDATE chat_log SET source = CASE
  WHEN user_id <> 0 THEN 'user'
  WHEN discord_name IS NOT NULL THEN 'discord'
  ELSE 'server'
END;
ALTER TABLE chat_log ALTER COLUMN source SET NOT NULL;
ALTER TABLE chat_log ADD CONSTRAINT chat_log_source_check CHECK (source IN ('user', 'server', 'discord'));
COMMIT;
