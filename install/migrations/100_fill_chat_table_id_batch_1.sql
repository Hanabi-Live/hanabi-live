-- A table's chat names its table in `table_id`, which `room` stores as "table" followed by the ID.
-- This batch covers the IDs below 63,000,000, at most about 1 million of the 32 million rows, in
-- steps of 50,000 IDs. A pause after each step leaves the disk to live queries for most of the
-- time. The server never changes a table's archived chat, so the locks that the batch holds until
-- it commits block nothing.
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id < 62650000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 62650000 AND id < 62700000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 62700000 AND id < 62750000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 62750000 AND id < 62800000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 62800000 AND id < 62850000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 62850000 AND id < 62900000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 62900000 AND id < 62950000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 62950000 AND id < 63000000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
