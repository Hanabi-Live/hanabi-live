-- A best score is NULL for a player count without a game, since 0 is also a score. This batch
-- covers the user IDs from 4738 to 14400, about 37,000 of the 447,000 rows of `user_stats`. The
-- server writes these rows when a game ends, so the slow read happens first, into a temporary
-- table, and the update locks each row for only a moment.
CREATE TEMPORARY TABLE played ON COMMIT DROP AS
SELECT DISTINCT p.user_id, g.variant_id, g.num_players
FROM game_participants AS p
JOIN games AS g ON g.id = p.game_id
WHERE p.user_id >= 4738 AND p.user_id < 14401;
CREATE INDEX ON played (user_id, variant_id, num_players);
ANALYZE played;
UPDATE user_stats AS s SET
    best_score2 = CASE
        WHEN s.best_score2 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p
            WHERE p.user_id = s.user_id AND p.variant_id = s.variant_id AND p.num_players = 2
        ) THEN NULL
        ELSE s.best_score2
    END,
    best_score3 = CASE
        WHEN s.best_score3 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p
            WHERE p.user_id = s.user_id AND p.variant_id = s.variant_id AND p.num_players = 3
        ) THEN NULL
        ELSE s.best_score3
    END,
    best_score4 = CASE
        WHEN s.best_score4 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p
            WHERE p.user_id = s.user_id AND p.variant_id = s.variant_id AND p.num_players = 4
        ) THEN NULL
        ELSE s.best_score4
    END,
    best_score5 = CASE
        WHEN s.best_score5 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p
            WHERE p.user_id = s.user_id AND p.variant_id = s.variant_id AND p.num_players = 5
        ) THEN NULL
        ELSE s.best_score5
    END,
    best_score6 = CASE
        WHEN s.best_score6 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p
            WHERE p.user_id = s.user_id AND p.variant_id = s.variant_id AND p.num_players = 6
        ) THEN NULL
        ELSE s.best_score6
    END
WHERE s.user_id >= 4738 AND s.user_id < 14401
  AND 0 IN (s.best_score2, s.best_score3, s.best_score4, s.best_score5, s.best_score6);
