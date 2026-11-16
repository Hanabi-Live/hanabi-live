-- Record the recipe of each variant ID. Games name their variant by ID, so an ID must keep its
-- recipe. The server adds new variants from the catalog at startup.
CREATE TABLE variants (
    id      SMALLINT  PRIMARY KEY,
    recipe  TEXT      NOT NULL  UNIQUE
);
