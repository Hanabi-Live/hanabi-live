-- Each variant's name. The server records the names of the catalog at startup. Later, it also names
-- the variants that it creates from recipes that the catalog does not have.
ALTER TABLE variants ADD COLUMN name TEXT NULL UNIQUE;
