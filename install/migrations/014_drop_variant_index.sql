---- tern: disable-tx ----
-- games_index_variant_id_score_id starts with variant_id, so it serves every variant lookup that
-- this index did. Production created this index as games_index_variant, so drop either name.
DROP INDEX CONCURRENTLY IF EXISTS games_index_variant;
DROP INDEX CONCURRENTLY IF EXISTS games_index_variant_id;
