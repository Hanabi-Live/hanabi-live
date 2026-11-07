---- tern: disable-tx ----
-- The variants API pages a variant's games by score. Without this index, every page sorts all of
-- the variant's games. A failed concurrent build leaves an invalid index, so drop any leftover
-- first; rerunning this migration then recovers.
DROP INDEX CONCURRENTLY IF EXISTS games_index_variant_id_score_id;
CREATE INDEX CONCURRENTLY games_index_variant_id_score_id ON games (variant_id, score DESC, id DESC);
