-- Detrimental Characters were removed. The server no longer writes this column, so new games take
-- false. A later migration drops it, once no running server writes it.
ALTER TABLE games ALTER COLUMN detrimental_characters SET DEFAULT FALSE;
