-- Servers no longer fence live-table writes with an ownership epoch, so they stop writing
-- `live_tables.epoch`. A later migration drops the column and `live_state_owner` once no running
-- server uses them. Setting a default changes only the catalog, so it does not rewrite the table.
ALTER TABLE live_tables ALTER COLUMN epoch SET DEFAULT 0;
