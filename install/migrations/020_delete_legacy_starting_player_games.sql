/*
 * Games now always start with the first seat. Delete the legacy games from before April 2020 that
 * started with another seat, and recount the statistics they contributed to. The running server
 * still writes the column until it restarts, and it already defaults to 0; a later migration drops
 * it.
 */

/* The deleted games, with their modifier as "ScoreModifier" in "server/src/model.rs" stores it. */
CREATE TEMPORARY TABLE removed_games ON COMMIT DROP AS
SELECT id, variant_id, num_players, seed, score,
    (deck_plays::int * 1 + empty_clues::int * 2 + one_extra_card::int * 4
        + one_less_card::int * 8 + all_or_nothing::int * 16)::smallint AS modifier
FROM games
WHERE starting_player <> 0;

CREATE TEMPORARY TABLE removed_participants ON COMMIT DROP AS
SELECT p.user_id, g.variant_id, g.num_players, g.score
FROM removed_games g
JOIN game_participants p ON p.game_id = g.id;

/*
 * A variant's maximum score is not stored, but when it has any maximum scores, it is the highest
 * score of its non-speedrun games.
 */
CREATE TEMPORARY TABLE variant_max_scores ON COMMIT DROP AS
SELECT g.variant_id, max(g.score) AS max_score
FROM games g
JOIN variant_stats v ON v.variant_id = g.variant_id AND v.num_max_scores > 0
WHERE NOT g.speedrun AND g.variant_id IN (SELECT variant_id FROM removed_games)
GROUP BY g.variant_id;

/* Triggers keep "users.num_normal_games" and "users.num_normal_speedrun_games" in step. */
DELETE FROM games WHERE id IN (SELECT id FROM removed_games);

UPDATE seeds
SET num_games = (SELECT count(*) FROM games WHERE games.seed = seeds.seed)
WHERE seed IN (SELECT seed FROM removed_games);
DELETE FROM seeds WHERE num_games = 0 AND seed IN (SELECT seed FROM removed_games);

UPDATE user_stats s
SET num_games = (
    SELECT count(*)
    FROM games g
    JOIN game_participants p ON p.game_id = g.id
    WHERE p.user_id = s.user_id AND g.variant_id = s.variant_id AND NOT g.speedrun
)
FROM (SELECT DISTINCT user_id, variant_id FROM removed_participants) r
WHERE s.user_id = r.user_id AND s.variant_id = r.variant_id;

UPDATE variant_stats v
SET num_games = (
        SELECT count(*) FROM games g WHERE g.variant_id = v.variant_id AND NOT g.speedrun
    ),
    num_max_scores = COALESCE((
        SELECT count(*)
        FROM games g
        JOIN variant_max_scores m ON m.variant_id = g.variant_id
        WHERE g.variant_id = v.variant_id AND NOT g.speedrun AND g.score = m.max_score
    ), 0)
WHERE v.variant_id IN (SELECT variant_id FROM removed_games);

/*
 * Recompute only the best scores that a deleted game could have set. A player's best score is
 * their highest one with the fewest modifiers; a variant's is the highest one without modifiers.
 */
DO $$
DECLARE
    n INTEGER;
BEGIN
    FOR n IN 2..6 LOOP
        EXECUTE format($sql$
            UPDATE user_stats s
            SET best_score%1$s = COALESCE(best.score, 0),
                best_score%1$s_mod = COALESCE(best.modifier, 0)
            FROM (SELECT DISTINCT user_id, variant_id, score FROM removed_participants
                  WHERE num_players = %1$s) r
            LEFT JOIN LATERAL (
                SELECT g.score,
                    (g.deck_plays::int * 1 + g.empty_clues::int * 2 + g.one_extra_card::int * 4
                        + g.one_less_card::int * 8 + g.all_or_nothing::int * 16)::smallint
                        AS modifier
                FROM games g
                JOIN game_participants p ON p.game_id = g.id
                WHERE p.user_id = r.user_id AND g.variant_id = r.variant_id
                    AND g.num_players = %1$s
                ORDER BY 1 DESC, 2
                LIMIT 1
            ) best ON TRUE
            WHERE s.user_id = r.user_id AND s.variant_id = r.variant_id
                AND s.best_score%1$s = r.score
        $sql$, n);

        EXECUTE format($sql$
            UPDATE variant_stats v
            SET best_score%1$s = COALESCE((
                SELECT max(g.score)
                FROM games g
                WHERE g.variant_id = v.variant_id AND g.num_players = %1$s
                    AND NOT (g.deck_plays OR g.empty_clues OR g.one_extra_card
                        OR g.one_less_card OR g.all_or_nothing)
            ), 0)
            WHERE EXISTS (
                SELECT 1 FROM removed_games r
                WHERE r.variant_id = v.variant_id AND r.num_players = %1$s
                    AND r.modifier = 0 AND r.score = v.best_score%1$s
            )
        $sql$, n);
    END LOOP;
END $$;
