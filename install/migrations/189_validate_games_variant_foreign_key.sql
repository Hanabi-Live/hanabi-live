-- Check that each existing game has a variant in the variants table. This scans the games table, but
-- it does not block reads and writes.
ALTER TABLE games VALIDATE CONSTRAINT games_variant_id_fkey;
