-- A live table's chat messages, game steps, and notes, each stored apart from its checkpoint. A
-- change then rewrites only the parts that changed. The server does not write this table yet, so
-- creating it does not block live work.
CREATE TABLE live_table_parts (
    table_id  BIGINT  NOT NULL  REFERENCES live_tables (id) ON DELETE CASCADE,
    part      TEXT    NOT NULL,
    value     TEXT    NOT NULL,
    PRIMARY KEY (table_id, part)
);
