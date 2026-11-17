-- Count only the games that ended normally, without speedruns, in each player's game count on a
-- variant. Pregame statistics show it next to their total, which counts the same games. This also
-- fixes counts that still include deleted games.

-- Read the stored counts and the recounts in one statement, so they see the same games.
CREATE TEMPORARY TABLE variant_game_counts AS
SELECT s.user_id, s.variant_id, s.num_games AS stored, COALESCE(c.normal, 0) AS normal
FROM user_stats s
LEFT JOIN (
    SELECT p.user_id, g.variant_id, count(*)::integer AS normal
    FROM game_participants p
    JOIN games g ON g.id = p.game_id
    WHERE g.end_condition = 1 AND NOT g.speedrun
    GROUP BY p.user_id, g.variant_id
) c ON c.user_id = s.user_id AND c.variant_id = s.variant_id;

-- The running server counts the games that it saves after the recount, so keep what it added.
UPDATE user_stats s
SET num_games = c.normal + (s.num_games - c.stored)
FROM variant_game_counts c
WHERE c.user_id = s.user_id AND c.variant_id = s.variant_id AND c.normal <> c.stored;

DROP TABLE variant_game_counts;
