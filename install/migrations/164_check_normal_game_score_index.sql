-- Stops the migrations if the previous one left an invalid index.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index AS i
        JOIN pg_class AS c ON c.oid = i.indexrelid
        WHERE c.relname = 'games_index_normal_variant_id_score' AND i.indisvalid
    ) THEN
        RAISE EXCEPTION
            'games_index_normal_variant_id_score is invalid: drop it and apply the migrations again';
    END IF;
END $$;
