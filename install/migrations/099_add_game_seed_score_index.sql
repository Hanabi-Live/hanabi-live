-- no-transaction
-- A seed's difficulty compares it with every seed of its variant and player count. This index
-- lets that query read only the index, instead of every game of the variant. Building it reads
-- the whole table without blocking writes. If the build fails, it leaves an invalid index: drop it
-- with `DROP INDEX CONCURRENTLY games_index_variant_id_num_players_seed` before applying the
-- migrations again.
CREATE INDEX CONCURRENTLY IF NOT EXISTS games_index_variant_id_num_players_seed
  ON games (variant_id, num_players, seed) INCLUDE (score);
