-- Store each player's count of all their games, however each one ended. The game history screen
-- shows this count as its total. Migration 184 fills it in.
ALTER TABLE users ADD COLUMN num_games INTEGER NOT NULL DEFAULT 0;
