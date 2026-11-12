-- no-transaction
-- Only the variant statistics counted a variant's games that are not speedruns.
DROP INDEX CONCURRENTLY IF EXISTS games_index_normal_variant_id_score;
