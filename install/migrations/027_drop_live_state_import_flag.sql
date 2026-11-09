-- The live tables were imported from Redis, so the flag that waited for the import is unused.
ALTER TABLE live_state_owner DROP COLUMN imported;
