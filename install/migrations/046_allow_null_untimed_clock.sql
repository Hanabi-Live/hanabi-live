-- Untimed games have no clock settings. They will store NULL instead of 0.
ALTER TABLE games ALTER COLUMN time_base DROP NOT NULL, ALTER COLUMN time_per_turn DROP NOT NULL;
