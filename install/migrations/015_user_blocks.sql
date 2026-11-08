CREATE TABLE user_blocks (
    user_id     INTEGER  NOT NULL,
    blocked_id  INTEGER  NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX user_blocks_index_blocked_id ON user_blocks (blocked_id);
