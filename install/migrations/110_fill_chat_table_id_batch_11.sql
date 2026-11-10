-- A table's chat names its table in `table_id`, which `room` stores as "table" followed by the ID.
-- This batch covers the IDs from 72,000,000 to 72,999,999, at most about 1 million of the 32
-- million rows, in steps of 50,000 IDs. A pause after each step leaves the disk to live queries for
-- most of the time. The server never changes a table's archived chat, so the locks that the batch
-- holds until it commits block nothing.
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72000000 AND id < 72050000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72050000 AND id < 72100000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72100000 AND id < 72150000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72150000 AND id < 72200000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72200000 AND id < 72250000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72250000 AND id < 72300000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72300000 AND id < 72350000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72350000 AND id < 72400000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72400000 AND id < 72450000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72450000 AND id < 72500000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72500000 AND id < 72550000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72550000 AND id < 72600000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72600000 AND id < 72650000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72650000 AND id < 72700000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72700000 AND id < 72750000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72750000 AND id < 72800000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72800000 AND id < 72850000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72850000 AND id < 72900000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72900000 AND id < 72950000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 72950000 AND id < 73000000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
