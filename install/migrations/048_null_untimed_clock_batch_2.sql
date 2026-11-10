-- Untimed games have no clock settings. Change about 894,000 of them from 0 to NULL in each of
-- 2 migrations, so that each one commits within a few minutes.
UPDATE games SET time_base = NULL, time_per_turn = NULL WHERE id >= 1113842 AND NOT timed;
