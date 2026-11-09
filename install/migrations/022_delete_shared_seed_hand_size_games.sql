/*
 * Games with "One Extra Card" or "One Less Card" now get their own seeds, because their scores
 * cannot be compared with games on the same deck that have normal hands. Delete the older ones,
 * which share seeds with normal games, and recount the statistics they contributed to. With both
 * options, the hand size is normal, so those games stay.
 *
 * The server is online, and deleting tens of thousands of games takes minutes. Rows that the
 * server writes (users, seeds, and statistics) stay locked from their update until this commits,
 * so the slow work only touches the deleted games, and every update of a shared row comes last.
 * The game counting triggers would update each player's row once per deleted game, locking it for
 * the whole deletion, so the deleted games are first marked as not normal, which makes the
 * triggers skip them, and the players' counts drop in one grouped update at the end.
 */

/* The deleted games, with their modifier as "ScoreModifier" in "server/src/model.rs" stores it. */
CREATE TEMPORARY TABLE removed_games ON COMMIT DROP AS
SELECT id, variant_id, num_players, seed, score, speedrun, end_condition,
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

/* What the counting triggers would have subtracted from each player. */
CREATE TEMPORARY TABLE removed_normal_games ON COMMIT DROP AS
SELECT p.user_id,
    count(*) FILTER (WHERE NOT g.speedrun) AS num_normal_games,
    count(*) FILTER (WHERE g.speedrun) AS num_normal_speedrun_games
FROM removed_games g
JOIN game_participants p ON p.game_id = g.id
WHERE g.end_condition = 1
GROUP BY p.user_id;

/* Temporary tables are never analyzed automatically. */
ANALYZE removed_games;
ANALYZE removed_participants;
ANALYZE removed_pairs;
ANALYZE removed_normal_games;

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

/* The counting triggers only count games that ended normally. */
UPDATE games SET end_condition = 0
WHERE id IN (SELECT id FROM removed_games WHERE end_condition = 1);

/* Actions are most of the deleted rows. */
DELETE FROM game_actions WHERE game_id IN (SELECT id FROM removed_games);
DELETE FROM games WHERE id IN (SELECT id FROM removed_games);

/* Everything below reads the remaining games, and only the final updates lock shared rows. */
CREATE TEMPORARY TABLE remaining_participants ON COMMIT DROP AS
SELECT p.user_id, g.variant_id, g.num_players, g.score, g.speedrun,
    (g.deck_plays::int * 1 + g.empty_clues::int * 2 + g.one_extra_card::int * 4
        + g.one_less_card::int * 8 + g.all_or_nothing::int * 16)::smallint AS modifier
FROM game_participants p
JOIN games g ON g.id = p.game_id
WHERE p.user_id IN (SELECT user_id FROM removed_pairs)
    AND (p.user_id, g.variant_id) IN (SELECT user_id, variant_id FROM removed_pairs);
ANALYZE remaining_participants;

CREATE TEMPORARY TABLE new_seed_counts ON COMMIT DROP AS
SELECT r.seed, count(g.id)::integer AS num_games
FROM (SELECT DISTINCT seed FROM removed_games) r
LEFT JOIN games g ON g.seed = r.seed
GROUP BY r.seed;

CREATE TEMPORARY TABLE new_user_stats ON COMMIT DROP AS
SELECT r.user_id, r.variant_id,
    count(p.user_id) FILTER (WHERE NOT p.speedrun)::integer AS num_games
FROM removed_pairs r
LEFT JOIN remaining_participants p USING (user_id, variant_id)
GROUP BY r.user_id, r.variant_id;

/*
 * A player's best score is their highest one with the fewest modifiers. Only the best scores that
 * a deleted game could have set change. A variant's best score is its highest one without
 * modifiers, which no deleted game has, so those stay.
 */
CREATE TEMPORARY TABLE new_best_scores ON COMMIT DROP AS
SELECT r.user_id, r.variant_id, r.num_players, r.removed_scores,
    COALESCE(best.score, 0) AS score, COALESCE(best.modifier, 0) AS modifier
FROM (
    SELECT user_id, variant_id, num_players, array_agg(DISTINCT score) AS removed_scores
    FROM removed_participants
    GROUP BY user_id, variant_id, num_players
) r
LEFT JOIN (
    SELECT DISTINCT ON (user_id, variant_id, num_players) user_id, variant_id, num_players,
        score, modifier
    FROM remaining_participants
    ORDER BY user_id, variant_id, num_players, score DESC, modifier
) best USING (user_id, variant_id, num_players);

CREATE TEMPORARY TABLE new_variant_stats ON COMMIT DROP AS
SELECT r.variant_id,
    count(g.id)::integer AS num_games,
    count(g.id) FILTER (WHERE g.score = m.max_score)::integer AS num_max_scores
FROM (SELECT DISTINCT variant_id FROM removed_games) r
LEFT JOIN variant_max_scores m USING (variant_id)
LEFT JOIN games g ON g.variant_id = r.variant_id AND NOT g.speedrun
GROUP BY r.variant_id;

ANALYZE new_seed_counts;
ANALYZE new_user_stats;
ANALYZE new_best_scores;
ANALYZE new_variant_stats;

UPDATE seeds s SET num_games = n.num_games FROM new_seed_counts n WHERE s.seed = n.seed;
DELETE FROM seeds WHERE num_games = 0 AND seed IN (SELECT seed FROM new_seed_counts);

UPDATE user_stats s
SET num_games = n.num_games,
    best_score2 = CASE WHEN s.best_score2 = ANY(b2.removed_scores) THEN b2.score
        ELSE s.best_score2 END,
    best_score2_mod = CASE WHEN s.best_score2 = ANY(b2.removed_scores) THEN b2.modifier
        ELSE s.best_score2_mod END,
    best_score3 = CASE WHEN s.best_score3 = ANY(b3.removed_scores) THEN b3.score
        ELSE s.best_score3 END,
    best_score3_mod = CASE WHEN s.best_score3 = ANY(b3.removed_scores) THEN b3.modifier
        ELSE s.best_score3_mod END,
    best_score4 = CASE WHEN s.best_score4 = ANY(b4.removed_scores) THEN b4.score
        ELSE s.best_score4 END,
    best_score4_mod = CASE WHEN s.best_score4 = ANY(b4.removed_scores) THEN b4.modifier
        ELSE s.best_score4_mod END,
    best_score5 = CASE WHEN s.best_score5 = ANY(b5.removed_scores) THEN b5.score
        ELSE s.best_score5 END,
    best_score5_mod = CASE WHEN s.best_score5 = ANY(b5.removed_scores) THEN b5.modifier
        ELSE s.best_score5_mod END,
    best_score6 = CASE WHEN s.best_score6 = ANY(b6.removed_scores) THEN b6.score
        ELSE s.best_score6 END,
    best_score6_mod = CASE WHEN s.best_score6 = ANY(b6.removed_scores) THEN b6.modifier
        ELSE s.best_score6_mod END
FROM new_user_stats n
LEFT JOIN new_best_scores b2 ON (b2.user_id, b2.variant_id, b2.num_players) = (n.user_id, n.variant_id, 2)
LEFT JOIN new_best_scores b3 ON (b3.user_id, b3.variant_id, b3.num_players) = (n.user_id, n.variant_id, 3)
LEFT JOIN new_best_scores b4 ON (b4.user_id, b4.variant_id, b4.num_players) = (n.user_id, n.variant_id, 4)
LEFT JOIN new_best_scores b5 ON (b5.user_id, b5.variant_id, b5.num_players) = (n.user_id, n.variant_id, 5)
LEFT JOIN new_best_scores b6 ON (b6.user_id, b6.variant_id, b6.num_players) = (n.user_id, n.variant_id, 6)
WHERE s.user_id = n.user_id AND s.variant_id = n.variant_id;

UPDATE variant_stats v
SET num_games = n.num_games, num_max_scores = n.num_max_scores
FROM new_variant_stats n
WHERE v.variant_id = n.variant_id;

/* Logins update players' rows, so they are locked last. */
UPDATE users u
SET num_normal_games = u.num_normal_games - r.num_normal_games,
    num_normal_speedrun_games = u.num_normal_speedrun_games - r.num_normal_speedrun_games
FROM removed_normal_games r
WHERE u.id = r.user_id;
