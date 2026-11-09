-- The server used to treat any account named "Bot-..." as a bot. It now uses only `is_bot`, so
-- those accounts keep their bot status.
UPDATE users SET is_bot = TRUE WHERE username LIKE 'Bot-%' AND NOT is_bot;
