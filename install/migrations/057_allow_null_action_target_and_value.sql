-- A game over that no player caused will have a NULL target instead of -1, and a play or a discard
-- will have a NULL value instead of 0.
ALTER TABLE game_actions ALTER COLUMN target DROP NOT NULL, ALTER COLUMN value DROP NOT NULL;
