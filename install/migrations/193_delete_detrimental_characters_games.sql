-- Detrimental Characters were removed, and the server can no longer replay their games. Delete
-- those games, and take them out of the players' statistics.

-- The players of each deleted game, read before the games are deleted.
CREATE TEMPORARY TABLE removed_players AS
SELECT p.user_id, g.variant_id, g.num_players, g.seed, g.end_condition = 1 AND NOT g.speedrun AS normal
FROM games g
JOIN game_participants p ON p.game_id = g.id
WHERE g.detrimental_characters;
ANALYZE removed_players;

-- Each player's best score on each variant and player count that a deleted game counted in, from
-- their other games. The modifier holds the same bits as "ScoreModifier" in "server/src/model.rs",
-- and the lowest one counts for a score that has several.
CREATE TEMPORARY TABLE best_by_count AS
SELECT DISTINCT ON (p.user_id, g.variant_id, g.num_players)
    p.user_id, g.variant_id, g.num_players, g.score,
    (g.deck_plays::integer + 2 * g.empty_clues::integer + 4 * g.one_extra_card::integer
        + 8 * g.one_less_card::integer + 16 * g.all_or_nothing::integer)::smallint AS modifier
FROM (SELECT DISTINCT user_id FROM removed_players) u
JOIN game_participants p ON p.user_id = u.user_id
JOIN games g ON g.id = p.game_id AND NOT g.detrimental_characters
JOIN (SELECT DISTINCT user_id, variant_id, num_players FROM removed_players) r
    ON r.user_id = p.user_id AND r.variant_id = g.variant_id AND r.num_players = g.num_players
ORDER BY p.user_id, g.variant_id, g.num_players, g.score DESC, modifier;

-- The same, with one row for each player and variant. A player with no other game on a variant and
-- player count has no best score there.
CREATE TEMPORARY TABLE best_scores AS
SELECT r.user_id, r.variant_id,
    bool_or(r.num_players = 2) AS has2,
    max(b.score) FILTER (WHERE r.num_players = 2) AS score2,
    max(b.modifier) FILTER (WHERE r.num_players = 2) AS modifier2,
    bool_or(r.num_players = 3) AS has3,
    max(b.score) FILTER (WHERE r.num_players = 3) AS score3,
    max(b.modifier) FILTER (WHERE r.num_players = 3) AS modifier3,
    bool_or(r.num_players = 4) AS has4,
    max(b.score) FILTER (WHERE r.num_players = 4) AS score4,
    max(b.modifier) FILTER (WHERE r.num_players = 4) AS modifier4,
    bool_or(r.num_players = 5) AS has5,
    max(b.score) FILTER (WHERE r.num_players = 5) AS score5,
    max(b.modifier) FILTER (WHERE r.num_players = 5) AS modifier5,
    bool_or(r.num_players = 6) AS has6,
    max(b.score) FILTER (WHERE r.num_players = 6) AS score6,
    max(b.modifier) FILTER (WHERE r.num_players = 6) AS modifier6
FROM (SELECT DISTINCT user_id, variant_id, num_players FROM removed_players) r
LEFT JOIN best_by_count b USING (user_id, variant_id, num_players)
GROUP BY r.user_id, r.variant_id;

-- The deleted games that ended normally, which the game counts on each variant include.
CREATE TEMPORARY TABLE removed_counts AS
SELECT user_id, variant_id, count(*)::integer AS normal
FROM removed_players
WHERE normal
GROUP BY user_id, variant_id;

-- Deleting a game deletes its participants, actions, notes, and tags. Its triggers take it out of
-- the players' game counts in "users".
DELETE FROM games WHERE detrimental_characters;

UPDATE user_stats s SET num_games = s.num_games - c.normal
FROM removed_counts c
WHERE s.user_id = c.user_id AND s.variant_id = c.variant_id;

UPDATE user_stats s SET
    best_score2 = CASE WHEN b.has2 THEN b.score2 ELSE s.best_score2 END,
    best_score2_mod = CASE WHEN b.has2 THEN b.modifier2 ELSE s.best_score2_mod END,
    best_score3 = CASE WHEN b.has3 THEN b.score3 ELSE s.best_score3 END,
    best_score3_mod = CASE WHEN b.has3 THEN b.modifier3 ELSE s.best_score3_mod END,
    best_score4 = CASE WHEN b.has4 THEN b.score4 ELSE s.best_score4 END,
    best_score4_mod = CASE WHEN b.has4 THEN b.modifier4 ELSE s.best_score4_mod END,
    best_score5 = CASE WHEN b.has5 THEN b.score5 ELSE s.best_score5 END,
    best_score5_mod = CASE WHEN b.has5 THEN b.modifier5 ELSE s.best_score5_mod END,
    best_score6 = CASE WHEN b.has6 THEN b.score6 ELSE s.best_score6 END,
    best_score6_mod = CASE WHEN b.has6 THEN b.modifier6 ELSE s.best_score6_mod END
FROM best_scores b
WHERE s.user_id = b.user_id AND s.variant_id = b.variant_id;

UPDATE seeds s SET num_games = (SELECT count(*) FROM games g WHERE g.seed = s.seed)
WHERE s.seed IN (SELECT DISTINCT seed FROM removed_players);

DROP TABLE removed_players, best_by_count, best_scores, removed_counts;
