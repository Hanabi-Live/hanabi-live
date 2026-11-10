-- no-transaction
-- The scores of the games that are not speedruns, by variant, so that the variant statistics can
-- count them with an index-only scan instead of reading the whole table. It holds about 1.8
-- million of the 1.9 million rows. Building it reads the whole table without blocking writes. If
-- the build fails, it leaves an invalid index: drop it with `DROP INDEX CONCURRENTLY
-- games_index_normal_variant_id_score` before applying the migrations again.
CREATE INDEX CONCURRENTLY IF NOT EXISTS games_index_normal_variant_id_score
    ON games (variant_id, score) WHERE NOT speedrun;
