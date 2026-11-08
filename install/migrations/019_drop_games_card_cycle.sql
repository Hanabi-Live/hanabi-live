/* The server is online, so give up instead of queueing every query behind this lock. */
SET LOCAL lock_timeout = '5s';
ALTER TABLE games DROP COLUMN card_cycle;
