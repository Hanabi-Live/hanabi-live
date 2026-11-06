-- Stop older servers before applying: their login queries require the retired column.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- A legacy credential was authoritative even when a modern hash was also present.
UPDATE users
SET password_hash = NULL
WHERE old_password_hash IS NOT NULL AND password_hash IS NOT NULL;

ALTER TABLE users DROP COLUMN old_password_hash;
