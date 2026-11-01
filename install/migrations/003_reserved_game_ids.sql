-- Finish games and resolve snapshots from the intermediate UUID-based server
-- before applying this migration. Original, unversioned snapshots remain supported.
ALTER TABLE games DROP COLUMN recovery_id;
