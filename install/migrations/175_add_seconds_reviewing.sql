-- The time each user spent in replays. A constant default is safe while the server is online.
ALTER TABLE users ADD COLUMN seconds_reviewing BIGINT NOT NULL DEFAULT 0;
