-- A player's character and its assigned metadata, with NULL for none. They will replace
-- `character_assignment` and `character_metadata`, which store none as -1 and as 0 (with the
-- metadata offset by 1).
ALTER TABLE game_participants ADD COLUMN character_id SMALLINT, ADD COLUMN assigned_metadata SMALLINT;
