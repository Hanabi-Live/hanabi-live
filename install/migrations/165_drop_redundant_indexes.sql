-- Each UNIQUE constraint already has an index on the same column, and no query filters or sorts by
-- the expiry of identity tokens. The tables hold a few dozen rows, so each drop locks its table
-- only briefly.
DROP INDEX IF EXISTS user_identity_tokens_index_token_lookup_hash;
DROP INDEX IF EXISTS user_identity_tokens_index_expires_at;
DROP INDEX IF EXISTS banned_ips_index_ip;
DROP INDEX IF EXISTS muted_ips_index_ip;
