/*
 * A game without a seed had its own deck, from before the server stopped saving imported decks.
 * No table stores that deck, so these games cannot be replayed. Production has three, from January
 * 2023. Delete them, so that every game has a seed.
 *
 * Saving a game that is not a speedrun adds it to its players' and its variant's game counts, so
 * subtract it again. The deletion trigger already subtracts each game from its players' normal game
 * counts. On production, none of these games set a best score or reached the maximum score, so
 * those stay. Only three games change, so every lock here is held for a moment.
 */
CREATE TEMPORARY TABLE removed_games ON COMMIT DROP AS
SELECT id, variant_id, speedrun FROM games WHERE seed IS NULL;

UPDATE user_stats s
SET num_games = s.num_games - r.num_games
FROM (
    SELECT p.user_id, g.variant_id, count(*)::integer AS num_games
    FROM removed_games g
    JOIN game_participants p ON p.game_id = g.id
    WHERE NOT g.speedrun
    GROUP BY p.user_id, g.variant_id
) r
WHERE s.user_id = r.user_id AND s.variant_id = r.variant_id;

UPDATE variant_stats v
SET num_games = v.num_games - r.num_games
FROM (
    SELECT variant_id, count(*)::integer AS num_games
    FROM removed_games
    WHERE NOT speedrun
    GROUP BY variant_id
) r
WHERE v.variant_id = r.variant_id;

DELETE FROM games WHERE id IN (SELECT id FROM removed_games);

-- NOT VALID does not check existing rows, so the table is locked only for a moment.
-- Migration 172 checks them without blocking reads or writes.
ALTER TABLE games ADD CONSTRAINT games_seed_not_null NOT NULL seed NOT VALID;
