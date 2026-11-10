-- `character_id` and `assigned_metadata` replaced these columns, which the server no longer uses.
ALTER TABLE game_participants DROP COLUMN character_assignment, DROP COLUMN character_metadata;
