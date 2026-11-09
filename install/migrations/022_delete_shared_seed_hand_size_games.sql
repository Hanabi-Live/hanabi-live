/*
 * Games with "One Extra Card" or "One Less Card" now get their own seeds, because their scores
 * cannot be compared with games on the same deck that have normal hands. Delete the older ones,
 * which share seeds with normal games, and recount the statistics they contributed to. With both
 * options, the hand size is normal, so those games stay.
 *
 * The server is online. Deleting a game locks its players' rows through the triggers that count
 * their games, which blocks recording their next game until this commits, so the slow work runs
 * before that point and the recounts use grouped queries instead of one query per player.
 */

/* The deleted games, with their modifier as "ScoreModifier" in "server/src/model.rs" stores it. */
CREATE TEMPORARY TABLE removed_games ON COMMIT DROP AS
SELECT id, variant_id, num_players, seed, score,
    (deck_plays::int * 1 + empty_clues::int * 2 + one_extra_card::int * 4
        + one_less_card::int * 8 + all_or_nothing::int * 16)::smallint AS modifier
FROM games
WHERE one_extra_card <> one_less_card AND seed ~ '^p[0-9]+v[0-9]+s';

CREATE TEMPORARY TABLE removed_participants ON COMMIT DROP AS
SELECT DISTINCT p.user_id, g.variant_id, g.num_players, g.score
FROM removed_games g
JOIN game_participants p ON p.game_id = g.id;

CREATE TEMPORARY TABLE removed_pairs ON COMMIT DROP AS
SELECT DISTINCT user_id, variant_id FROM removed_participants;

/* Temporary tables are never analyzed automatically. */
ANALYZE removed_games;
ANALYZE removed_participants;
ANALYZE removed_pairs;

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

/* Actions are most of the deleted rows, and deleting them first locks nothing the server uses. */
DELETE FROM game_actions WHERE game_id IN (SELECT id FROM removed_games);

/* Triggers keep "users.num_normal_games" and "users.num_normal_speedrun_games" in step. */
DELETE FROM games WHERE id IN (SELECT id FROM removed_games);

UPDATE seeds
SET num_games = (SELECT count(*) FROM games WHERE games.seed = seeds.seed)
WHERE seed IN (SELECT seed FROM removed_games);
DELETE FROM seeds WHERE num_games = 0 AND seed IN (SELECT seed FROM removed_games);

/* The remaining games of each affected player in each affected variant. */
CREATE TEMPORARY TABLE remaining_participants ON COMMIT DROP AS
SELECT p.user_id, g.variant_id, g.num_players, g.score, g.speedrun,
    (g.deck_plays::int * 1 + g.empty_clues::int * 2 + g.one_extra_card::int * 4
        + g.one_less_card::int * 8 + g.all_or_nothing::int * 16)::smallint AS modifier
FROM game_participants p
JOIN games g ON g.id = p.game_id
WHERE p.user_id IN (SELECT user_id FROM removed_pairs)
    AND (p.user_id, g.variant_id) IN (SELECT user_id, variant_id FROM removed_pairs);
ANALYZE remaining_participants;

UPDATE user_stats s
SET num_games = COALESCE(c.num_games, 0)
FROM removed_pairs r
LEFT JOIN (
    SELECT user_id, variant_id, count(*) AS num_games
    FROM remaining_participants
    WHERE NOT speedrun
    GROUP BY user_id, variant_id
) c USING (user_id, variant_id)
WHERE s.user_id = r.user_id AND s.variant_id = r.variant_id;

UPDATE variant_stats v
SET num_games = COALESCE(c.num_games, 0),
    num_max_scores = COALESCE(c.num_max_scores, 0)
FROM (SELECT DISTINCT variant_id FROM removed_games) r
LEFT JOIN (
    SELECT g.variant_id,
        count(*) AS num_games,
        count(*) FILTER (WHERE g.score = m.max_score) AS num_max_scores
    FROM games g
    LEFT JOIN variant_max_scores m ON m.variant_id = g.variant_id
    WHERE NOT g.speedrun AND g.variant_id IN (SELECT variant_id FROM removed_games)
    GROUP BY g.variant_id
) c USING (variant_id)
WHERE v.variant_id = r.variant_id;

/*
 * Recompute only the best scores that a deleted game could have set. A player's best score is
 * their highest one with the fewest modifiers; a variant's is the highest one without modifiers,
 * which no deleted game has, so the variants' best scores stay.
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
            LEFT JOIN (
                SELECT DISTINCT ON (user_id, variant_id) user_id, variant_id, score, modifier
                FROM remaining_participants
                WHERE num_players = %1$s
                ORDER BY user_id, variant_id, score DESC, modifier
            ) best USING (user_id, variant_id)
            WHERE s.user_id = r.user_id AND s.variant_id = r.variant_id
                AND s.best_score%1$s = r.score
        $sql$, n);
    END LOOP;
END $$;
