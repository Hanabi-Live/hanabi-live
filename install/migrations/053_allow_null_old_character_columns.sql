-- The server no longer writes `character_assignment` and `character_metadata`, which a later
-- release drops. `character_id` and `assigned_metadata` replace them.
ALTER TABLE game_participants
    ALTER COLUMN character_assignment DROP NOT NULL,
    ALTER COLUMN character_metadata DROP NOT NULL;
