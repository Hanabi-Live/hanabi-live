-- Servers no longer fence live-table writes with an ownership epoch, so the epoch is unused.
-- No running server reads `live_state_owner`. The `ALTER TABLE` comes last because it locks
-- `live_tables`; dropping a column changes only the catalog, so the lock is brief.
DROP TABLE live_state_owner;
ALTER TABLE live_tables DROP COLUMN epoch;
