-- Server and Discord messages have no author. They will store NULL instead of 0.
ALTER TABLE chat_log ALTER COLUMN user_id DROP NOT NULL;
