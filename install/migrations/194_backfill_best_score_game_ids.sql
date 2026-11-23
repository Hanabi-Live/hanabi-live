-- Record the game that set each best score in user_stats: the first game with that score and
-- modifier. A best score whose game was deleted keeps no game.

-- The join is large, so give its sorts more memory. Production finds the games in about 30 seconds.
SET LOCAL work_mem = '128MB';
SET LOCAL jit = off;

-- Find the games before the update, so that the rows of user_stats stay locked only for the update.
-- Joining each player's games to their best scores, instead of the other way around, keeps the
-- planner from reading every game of a variant with a score for each best score.
CREATE TEMPORARY TABLE best_score_games AS
WITH best AS MATERIALIZED (
    SELECT s.user_id, s.variant_id, b.num_players, b.score, b.modifier
    FROM user_stats s
    CROSS JOIN LATERAL (VALUES
        (2::smallint, s.best_score2, s.best_score2_mod),
        (3::smallint, s.best_score3, s.best_score3_mod),
        (4::smallint, s.best_score4, s.best_score4_mod),
        (5::smallint, s.best_score5, s.best_score5_mod),
        (6::smallint, s.best_score6, s.best_score6_mod)
    ) AS b(num_players, score, modifier)
    WHERE b.score IS NOT NULL
), played AS MATERIALIZED (
    -- The modifier has the bits of ScoreModifier in server/src/model.rs.
    SELECT p.user_id, g.variant_id, g.num_players, g.score,
        (g.deck_plays::int + 2 * g.empty_clues::int + 4 * g.one_extra_card::int
            + 8 * g.one_less_card::int + 16 * g.all_or_nothing::int)::smallint AS modifier,
        g.datetime_finished, g.id
    FROM game_participants p
    JOIN games g ON g.id = p.game_id
), first_games AS (
    SELECT DISTINCT ON (b.user_id, b.variant_id, b.num_players)
        b.user_id, b.variant_id, b.num_players, b.score, b.modifier, x.id AS game_id
    FROM played x
    JOIN best b ON b.user_id = x.user_id AND b.variant_id = x.variant_id
        AND b.num_players = x.num_players AND b.score = x.score AND b.modifier = x.modifier
    ORDER BY b.user_id, b.variant_id, b.num_players, x.datetime_finished, x.id
)
SELECT user_id, variant_id,
    max(score) FILTER (WHERE num_players = 2) AS score2,
    max(modifier) FILTER (WHERE num_players = 2) AS modifier2,
    max(game_id) FILTER (WHERE num_players = 2) AS game2,
    max(score) FILTER (WHERE num_players = 3) AS score3,
    max(modifier) FILTER (WHERE num_players = 3) AS modifier3,
    max(game_id) FILTER (WHERE num_players = 3) AS game3,
    max(score) FILTER (WHERE num_players = 4) AS score4,
    max(modifier) FILTER (WHERE num_players = 4) AS modifier4,
    max(game_id) FILTER (WHERE num_players = 4) AS game4,
    max(score) FILTER (WHERE num_players = 5) AS score5,
    max(modifier) FILTER (WHERE num_players = 5) AS modifier5,
    max(game_id) FILTER (WHERE num_players = 5) AS game5,
    max(score) FILTER (WHERE num_players = 6) AS score6,
    max(modifier) FILTER (WHERE num_players = 6) AS modifier6,
    max(game_id) FILTER (WHERE num_players = 6) AS game6
FROM first_games
GROUP BY user_id, variant_id;

-- The running server may set a best score after the search. Fill in only a game that it has not
-- recorded, and only while the best score is still the one that the search found.
UPDATE user_stats s SET
    best_score2_game_id = COALESCE(s.best_score2_game_id, CASE
        WHEN s.best_score2 = f.score2 AND s.best_score2_mod = f.modifier2 THEN f.game2 END),
    best_score3_game_id = COALESCE(s.best_score3_game_id, CASE
        WHEN s.best_score3 = f.score3 AND s.best_score3_mod = f.modifier3 THEN f.game3 END),
    best_score4_game_id = COALESCE(s.best_score4_game_id, CASE
        WHEN s.best_score4 = f.score4 AND s.best_score4_mod = f.modifier4 THEN f.game4 END),
    best_score5_game_id = COALESCE(s.best_score5_game_id, CASE
        WHEN s.best_score5 = f.score5 AND s.best_score5_mod = f.modifier5 THEN f.game5 END),
    best_score6_game_id = COALESCE(s.best_score6_game_id, CASE
        WHEN s.best_score6 = f.score6 AND s.best_score6_mod = f.modifier6 THEN f.game6 END)
FROM best_score_games f
WHERE f.user_id = s.user_id AND f.variant_id = s.variant_id;

DROP TABLE best_score_games;
