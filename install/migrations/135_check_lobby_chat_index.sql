-- Stops the migrations if the previous one left an invalid index, which the server must not run
-- without.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index AS i
        JOIN pg_class AS c ON c.oid = i.indexrelid
        WHERE c.relname = 'chat_log_index_lobby' AND i.indisvalid
    ) THEN
        RAISE EXCEPTION 'chat_log_index_lobby is invalid: drop it and apply the migrations again';
    END IF;
END $$;
