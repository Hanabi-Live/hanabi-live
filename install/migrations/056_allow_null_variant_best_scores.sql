-- A best score will be NULL for a player count that the variant has no game without options for,
-- since 0 is also a score.
ALTER TABLE variant_stats
    ALTER COLUMN best_score2 DROP NOT NULL,
    ALTER COLUMN best_score3 DROP NOT NULL,
    ALTER COLUMN best_score4 DROP NOT NULL,
    ALTER COLUMN best_score5 DROP NOT NULL,
    ALTER COLUMN best_score6 DROP NOT NULL;
