LOCK TABLE active_games IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM active_games) THEN
        RAISE EXCEPTION 'Recover legacy active_games checkpoints with a compatible earlier release before applying this migration.';
    END IF;
END
$$;

DROP TABLE active_games;
