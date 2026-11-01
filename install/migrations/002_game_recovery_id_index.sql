---- tern: disable-tx ----
DROP INDEX CONCURRENTLY IF EXISTS games_index_recovery_id;
CREATE UNIQUE INDEX CONCURRENTLY games_index_recovery_id
    ON games (recovery_id) WHERE recovery_id IS NOT NULL;
