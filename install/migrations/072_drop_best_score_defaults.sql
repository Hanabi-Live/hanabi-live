-- The server writes NULL for a player count without a game, so the best scores no longer default to
-- 0.
ALTER TABLE user_stats
    ALTER COLUMN best_score2 DROP DEFAULT,
    ALTER COLUMN best_score3 DROP DEFAULT,
    ALTER COLUMN best_score4 DROP DEFAULT,
    ALTER COLUMN best_score5 DROP DEFAULT,
    ALTER COLUMN best_score6 DROP DEFAULT;
ALTER TABLE variant_stats
    ALTER COLUMN best_score2 DROP DEFAULT,
    ALTER COLUMN best_score3 DROP DEFAULT,
    ALTER COLUMN best_score4 DROP DEFAULT,
    ALTER COLUMN best_score5 DROP DEFAULT,
    ALTER COLUMN best_score6 DROP DEFAULT;
