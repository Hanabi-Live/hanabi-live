-- Exercise the migration against a legacy chat_log table with representative rows.
CREATE TABLE chat_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    discord_name TEXT,
    message TEXT NOT NULL,
    room TEXT NOT NULL,
    datetime_sent TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO chat_log (user_id, discord_name, message, room) VALUES
    (42, NULL, 'user message', 'lobby'),
    (0, NULL, 'server message', 'lobby'),
    (0, 'Discord sender', 'discord message', 'lobby');

\i install/migrations/chat_log_source.sql

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM chat_log) <> 3 THEN
        RAISE EXCEPTION 'The migration did not preserve all existing messages.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM chat_log WHERE message = 'user message' AND source = 'user')
       OR NOT EXISTS (SELECT 1 FROM chat_log WHERE message = 'server message' AND source = 'server')
       OR NOT EXISTS (SELECT 1 FROM chat_log WHERE message = 'discord message' AND source = 'discord') THEN
        RAISE EXCEPTION 'The migration assigned an incorrect chat source.';
    END IF;

    BEGIN
        INSERT INTO chat_log (user_id, source, message, room)
        VALUES (42, 'invalid', 'invalid source', 'lobby');
        RAISE EXCEPTION 'The database accepted an invalid chat source.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO chat_log (user_id, message, room)
        VALUES (42, 'missing source', 'lobby');
        RAISE EXCEPTION 'The database accepted a missing chat source.';
    EXCEPTION WHEN not_null_violation THEN
        NULL;
    END;
END;
$$;
