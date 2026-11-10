-- A table's chat names its table in `table_id`, which `room` stores as "table" followed by the ID.
-- This batch covers the IDs from 74,000,000 to 74,999,999, at most about 1 million of the 32
-- million rows, in steps of 50,000 IDs. A pause after each step leaves the disk to live queries for
-- most of the time. The server never changes a table's archived chat, so the locks that the batch
-- holds until it commits block nothing.
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74000000 AND id < 74050000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74050000 AND id < 74100000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74100000 AND id < 74150000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74150000 AND id < 74200000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74200000 AND id < 74250000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74250000 AND id < 74300000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74300000 AND id < 74350000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74350000 AND id < 74400000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74400000 AND id < 74450000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74450000 AND id < 74500000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74500000 AND id < 74550000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74550000 AND id < 74600000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74600000 AND id < 74650000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74650000 AND id < 74700000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74700000 AND id < 74750000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74750000 AND id < 74800000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74800000 AND id < 74850000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74850000 AND id < 74900000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74900000 AND id < 74950000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
UPDATE chat_log SET table_id = substring(room FROM 6)::bigint
WHERE id >= 74950000 AND id < 75000000 AND table_id IS NULL AND room LIKE 'table%';
SELECT pg_sleep(5);
