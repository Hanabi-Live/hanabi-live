-- no-transaction
-- Find the users with a lookalike key, which each new account looks up. Building the index
-- concurrently does not block writes to the users table. If the build fails, it leaves an invalid
-- index: remove it with "DROP INDEX CONCURRENTLY IF EXISTS users_index_lookalike_key" before you
-- run this migration again.
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_index_lookalike_key ON users (lookalike_key);
