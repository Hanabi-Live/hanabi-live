-- A Discord message without an author has a NULL name, not an empty one. NOT VALID adds the
-- constraint without a scan of the existing rows, so it locks the table only briefly.
ALTER TABLE chat_log
    ADD CONSTRAINT chat_log_discord_name_check CHECK (discord_name <> '') NOT VALID;
