-- The server writes NULL for the modifier of a player count without a game, so the modifiers no
-- longer default to 0.
ALTER TABLE user_stats
    ALTER COLUMN best_score2_mod DROP DEFAULT,
    ALTER COLUMN best_score3_mod DROP DEFAULT,
    ALTER COLUMN best_score4_mod DROP DEFAULT,
    ALTER COLUMN best_score5_mod DROP DEFAULT,
    ALTER COLUMN best_score6_mod DROP DEFAULT;
