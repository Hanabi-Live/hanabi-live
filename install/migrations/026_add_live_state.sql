-- Live tables move from Redis to PostgreSQL. Each row holds a table's latest checkpoint.
CREATE SEQUENCE live_table_ids MAXVALUE 9007199254740991;

CREATE TABLE live_tables (
    id        BIGINT  PRIMARY KEY,
    revision  BIGINT  NOT NULL  CHECK (revision >= 0),
    /* The checkpoint JSON. A table that is reserved but not saved yet has none. */
    payload   TEXT    NULL      CHECK ((revision = 0) = (payload IS NULL)),
    /* The ownership epoch that reserved the table. A later owner removes unused reservations. */
    epoch     BIGINT  NOT NULL
);

CREATE TABLE live_state_owner (
    singleton  BOOLEAN  PRIMARY KEY  DEFAULT TRUE  CHECK (singleton),
    /* Each server that takes ownership increments this. Writes from older owners fail. */
    epoch      BIGINT   NOT NULL,
    /* False until the live tables that an installation kept in Redis are imported. */
    imported   BOOLEAN  NOT NULL
);
INSERT INTO live_state_owner (epoch, imported) VALUES (0, FALSE);
