-- A game with its own deck instead of a seed, such as an imported one, will have a NULL seed
-- instead of "JSON".
ALTER TABLE games ALTER COLUMN seed DROP NOT NULL;
