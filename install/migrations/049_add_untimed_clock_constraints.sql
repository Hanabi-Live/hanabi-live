-- NOT VALID does not check existing rows, so the table is locked only for a moment.
-- Migration 050 checks them without blocking reads or writes.
ALTER TABLE games
    ADD CONSTRAINT games_time_base_check CHECK (timed = (time_base IS NOT NULL)) NOT VALID,
    ADD CONSTRAINT games_time_per_turn_check CHECK (timed = (time_per_turn IS NOT NULL)) NOT VALID;
