-- A best score's modifier will be NULL when there is no best score, since 0 is the modifier of a
-- score without options.
ALTER TABLE user_stats
    ALTER COLUMN best_score2_mod DROP NOT NULL,
    ALTER COLUMN best_score3_mod DROP NOT NULL,
    ALTER COLUMN best_score4_mod DROP NOT NULL,
    ALTER COLUMN best_score5_mod DROP NOT NULL,
    ALTER COLUMN best_score6_mod DROP NOT NULL;
