-- The key that usernames that look alike share, such as "Modem" and "Modern" (see "lookalike_key"
-- in server/src/accounts/normalization.rs). SQL cannot compute it, so the server fills it in for
-- the existing users after it starts. It is NULL until then.
ALTER TABLE users ADD COLUMN lookalike_key TEXT NULL;
