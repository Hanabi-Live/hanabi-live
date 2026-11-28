-- The failed logins of each account from clients that never signed in to it, and the time until
-- which the account accepts no login from such a client (see server/src/accounts/lockout.rs).
CREATE TABLE login_failures (
    user_id        INTEGER      NOT NULL  PRIMARY KEY,
    failures       INTEGER      NOT NULL,
    blocked_until  TIMESTAMPTZ  NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
