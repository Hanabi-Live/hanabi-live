-- A best score will be NULL for a player count that the user has not played, since 0 is also a
-- score.
ALTER TABLE user_stats
    ALTER COLUMN best_score2 DROP NOT NULL,
    ALTER COLUMN best_score3 DROP NOT NULL,
    ALTER COLUMN best_score4 DROP NOT NULL,
    ALTER COLUMN best_score5 DROP NOT NULL,
    ALTER COLUMN best_score6 DROP NOT NULL;
