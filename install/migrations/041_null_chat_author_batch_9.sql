-- Server and Discord messages have no author. Change about 1.9 million of them from 0 to NULL
-- in each of 10 migrations, so that each one commits within a few minutes.
UPDATE chat_log SET user_id = NULL WHERE id >= 87790000 AND id < 91390000 AND user_id = 0;
