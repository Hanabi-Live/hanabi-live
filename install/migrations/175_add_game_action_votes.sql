-- The players who voted to end a game, on the action that a vote ended it with. Older games have
-- none.
ALTER TABLE game_actions ADD COLUMN votes SMALLINT[];
