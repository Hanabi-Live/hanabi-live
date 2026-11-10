-- A table's chat names its table in `table_id`, which `room` stores as "table" followed by the ID.
-- This batch covers the IDs from 95,000,000 on, at most about 1 million of the 32 million rows, in
-- steps of 50,000 IDs. A pause after each step leaves the disk to live queries for most of the
-- time. The server never changes a table's archived chat, so the locks that the batch holds until
-- it commits block nothing.
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95000000 AND id < 95050000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95050000 AND id < 95100000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95100000 AND id < 95150000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95150000 AND id < 95200000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95200000 AND id < 95250000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95250000 AND id < 95300000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95300000 AND id < 95350000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95350000 AND id < 95400000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95400000 AND id < 95450000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95450000 AND id < 95500000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95500000 AND id < 95550000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95550000 AND id < 95600000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95600000 AND id < 95650000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95650000 AND id < 95700000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95700000 AND id < 95750000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95750000 AND id < 95800000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95800000 AND id < 95850000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95850000 AND id < 95900000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95900000 AND id < 95950000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 95950000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
