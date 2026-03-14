CREATE TABLE user_identity_tokens (
    user_id           INTEGER      NOT NULL  PRIMARY KEY,
    token_hash        TEXT         NOT NULL, /* Argon2 hash */
    token_lookup_hash TEXT         NOT NULL  UNIQUE, /* keyed lookup hash */
    expires_at        TIMESTAMPTZ  NOT NULL,
    datetime_created  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    datetime_updated  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX user_identity_tokens_index_token_lookup_hash ON user_identity_tokens (token_lookup_hash);
CREATE INDEX user_identity_tokens_index_expires_at ON user_identity_tokens (expires_at);
