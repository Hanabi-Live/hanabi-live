-- A table's chat names its table in `table_id`, which `room` stores as "table" followed by the ID.
-- This batch covers the IDs from 78,000,000 to 78,999,999, at most about 1 million of the 32
-- million rows, in steps of 50,000 IDs. A pause after each step leaves the disk to live queries for
-- most of the time. The server never changes a table's archived chat, so the locks that the batch
-- holds until it commits block nothing.
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78000000 AND id < 78050000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78050000 AND id < 78100000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78100000 AND id < 78150000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78150000 AND id < 78200000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78200000 AND id < 78250000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78250000 AND id < 78300000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78300000 AND id < 78350000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78350000 AND id < 78400000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78400000 AND id < 78450000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78450000 AND id < 78500000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78500000 AND id < 78550000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78550000 AND id < 78600000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78600000 AND id < 78650000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78650000 AND id < 78700000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78700000 AND id < 78750000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78750000 AND id < 78800000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78800000 AND id < 78850000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78850000 AND id < 78900000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78900000 AND id < 78950000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 78950000 AND id < 79000000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
