-- Work out again each best score in user_stats that has no game after migration 194, from the
-- player's games that remain. On production, 9,167 of them claim no option, but every game with the
-- score used one, such as deck plays. 370 more come from deleted games, and the player has a lower
-- score left. 1,742 more have no game left, so they become empty.

-- The search reads the games of 4,147 players. Production runs it in about 20 seconds.
SET LOCAL work_mem = '128MB';
SET LOCAL jit = off;

-- Find the scores before the update, so that the rows of user_stats stay locked only for the update.
-- The best score is the highest, then the one with the fewest options, then the first game, as the
-- server picks it.
CREATE TEMPORARY TABLE best_score_fixes AS
WITH unmatched AS MATERIALIZED (
    SELECT s.user_id, s.variant_id, b.num_players, b.score, b.modifier
    FROM user_stats s
    CROSS JOIN LATERAL (VALUES
        (2::smallint, s.best_score2, s.best_score2_mod, s.best_score2_game_id),
        (3::smallint, s.best_score3, s.best_score3_mod, s.best_score3_game_id),
        (4::smallint, s.best_score4, s.best_score4_mod, s.best_score4_game_id),
        (5::smallint, s.best_score5, s.best_score5_mod, s.best_score5_game_id),
        (6::smallint, s.best_score6, s.best_score6_mod, s.best_score6_game_id)
    ) AS b(num_players, score, modifier, game_id)
    WHERE b.score IS NOT NULL AND b.game_id IS NULL
), played AS MATERIALIZED (
    -- The modifier has the bits of ScoreModifier in server/src/model.rs.
    SELECT p.user_id, g.variant_id, g.num_players, g.score,
        (g.deck_plays::int + 2 * g.empty_clues::int + 4 * g.one_extra_card::int
            + 8 * g.one_less_card::int + 16 * g.all_or_nothing::int)::smallint AS modifier,
        g.datetime_finished, g.id
    FROM game_participants p
    JOIN games g ON g.id = p.game_id
    WHERE p.user_id IN (SELECT user_id FROM unmatched)
), best AS (
    SELECT DISTINCT ON (x.user_id, x.variant_id, x.num_players)
        x.user_id, x.variant_id, x.num_players, x.score, x.modifier, x.id
    FROM played x
    JOIN unmatched u USING (user_id, variant_id, num_players)
    ORDER BY x.user_id, x.variant_id, x.num_players, x.score DESC, x.modifier, x.datetime_finished,
        x.id
), fixes AS (
    SELECT u.user_id, u.variant_id, u.num_players, u.score AS old_score,
        u.modifier AS old_modifier, b.score, b.modifier, b.id AS game_id
    FROM unmatched u
    LEFT JOIN best b USING (user_id, variant_id, num_players)
)
SELECT user_id, variant_id,
    bool_or(num_players = 2) AS has2,
    max(old_score) FILTER (WHERE num_players = 2) AS old_score2,
    max(old_modifier) FILTER (WHERE num_players = 2) AS old_modifier2,
    max(score) FILTER (WHERE num_players = 2) AS score2,
    max(modifier) FILTER (WHERE num_players = 2) AS modifier2,
    max(game_id) FILTER (WHERE num_players = 2) AS game2,
    bool_or(num_players = 3) AS has3,
    max(old_score) FILTER (WHERE num_players = 3) AS old_score3,
    max(old_modifier) FILTER (WHERE num_players = 3) AS old_modifier3,
    max(score) FILTER (WHERE num_players = 3) AS score3,
    max(modifier) FILTER (WHERE num_players = 3) AS modifier3,
    max(game_id) FILTER (WHERE num_players = 3) AS game3,
    bool_or(num_players = 4) AS has4,
    max(old_score) FILTER (WHERE num_players = 4) AS old_score4,
    max(old_modifier) FILTER (WHERE num_players = 4) AS old_modifier4,
    max(score) FILTER (WHERE num_players = 4) AS score4,
    max(modifier) FILTER (WHERE num_players = 4) AS modifier4,
    max(game_id) FILTER (WHERE num_players = 4) AS game4,
    bool_or(num_players = 5) AS has5,
    max(old_score) FILTER (WHERE num_players = 5) AS old_score5,
    max(old_modifier) FILTER (WHERE num_players = 5) AS old_modifier5,
    max(score) FILTER (WHERE num_players = 5) AS score5,
    max(modifier) FILTER (WHERE num_players = 5) AS modifier5,
    max(game_id) FILTER (WHERE num_players = 5) AS game5,
    bool_or(num_players = 6) AS has6,
    max(old_score) FILTER (WHERE num_players = 6) AS old_score6,
    max(old_modifier) FILTER (WHERE num_players = 6) AS old_modifier6,
    max(score) FILTER (WHERE num_players = 6) AS score6,
    max(modifier) FILTER (WHERE num_players = 6) AS modifier6,
    max(game_id) FILTER (WHERE num_players = 6) AS game6
FROM fixes
GROUP BY user_id, variant_id;

-- The running server may set a best score after the search. Change only a best score that is still
-- the one that the search found.
UPDATE user_stats s SET
    best_score2 = CASE WHEN f.has2 AND s.best_score2_game_id IS NULL AND s.best_score2 = f.old_score2
        AND s.best_score2_mod = f.old_modifier2
        THEN f.score2 ELSE s.best_score2 END,
    best_score2_mod = CASE WHEN f.has2 AND s.best_score2_game_id IS NULL AND s.best_score2 = f.old_score2
        AND s.best_score2_mod = f.old_modifier2
        THEN f.modifier2 ELSE s.best_score2_mod END,
    best_score2_game_id = CASE WHEN f.has2 AND s.best_score2_game_id IS NULL AND s.best_score2 = f.old_score2
        AND s.best_score2_mod = f.old_modifier2
        THEN f.game2 ELSE s.best_score2_game_id END,
    best_score3 = CASE WHEN f.has3 AND s.best_score3_game_id IS NULL AND s.best_score3 = f.old_score3
        AND s.best_score3_mod = f.old_modifier3
        THEN f.score3 ELSE s.best_score3 END,
    best_score3_mod = CASE WHEN f.has3 AND s.best_score3_game_id IS NULL AND s.best_score3 = f.old_score3
        AND s.best_score3_mod = f.old_modifier3
        THEN f.modifier3 ELSE s.best_score3_mod END,
    best_score3_game_id = CASE WHEN f.has3 AND s.best_score3_game_id IS NULL AND s.best_score3 = f.old_score3
        AND s.best_score3_mod = f.old_modifier3
        THEN f.game3 ELSE s.best_score3_game_id END,
    best_score4 = CASE WHEN f.has4 AND s.best_score4_game_id IS NULL AND s.best_score4 = f.old_score4
        AND s.best_score4_mod = f.old_modifier4
        THEN f.score4 ELSE s.best_score4 END,
    best_score4_mod = CASE WHEN f.has4 AND s.best_score4_game_id IS NULL AND s.best_score4 = f.old_score4
        AND s.best_score4_mod = f.old_modifier4
        THEN f.modifier4 ELSE s.best_score4_mod END,
    best_score4_game_id = CASE WHEN f.has4 AND s.best_score4_game_id IS NULL AND s.best_score4 = f.old_score4
        AND s.best_score4_mod = f.old_modifier4
        THEN f.game4 ELSE s.best_score4_game_id END,
    best_score5 = CASE WHEN f.has5 AND s.best_score5_game_id IS NULL AND s.best_score5 = f.old_score5
        AND s.best_score5_mod = f.old_modifier5
        THEN f.score5 ELSE s.best_score5 END,
    best_score5_mod = CASE WHEN f.has5 AND s.best_score5_game_id IS NULL AND s.best_score5 = f.old_score5
        AND s.best_score5_mod = f.old_modifier5
        THEN f.modifier5 ELSE s.best_score5_mod END,
    best_score5_game_id = CASE WHEN f.has5 AND s.best_score5_game_id IS NULL AND s.best_score5 = f.old_score5
        AND s.best_score5_mod = f.old_modifier5
        THEN f.game5 ELSE s.best_score5_game_id END,
    best_score6 = CASE WHEN f.has6 AND s.best_score6_game_id IS NULL AND s.best_score6 = f.old_score6
        AND s.best_score6_mod = f.old_modifier6
        THEN f.score6 ELSE s.best_score6 END,
    best_score6_mod = CASE WHEN f.has6 AND s.best_score6_game_id IS NULL AND s.best_score6 = f.old_score6
        AND s.best_score6_mod = f.old_modifier6
        THEN f.modifier6 ELSE s.best_score6_mod END,
    best_score6_game_id = CASE WHEN f.has6 AND s.best_score6_game_id IS NULL AND s.best_score6 = f.old_score6
        AND s.best_score6_mod = f.old_modifier6
        THEN f.game6 ELSE s.best_score6_game_id END
FROM best_score_fixes f
WHERE f.user_id = s.user_id AND f.variant_id = s.variant_id;

DROP TABLE best_score_fixes;
