-- The achievements that each player has unlocked. The server works them out from the saved games,
-- writes them when a game is saved, and writes all of them again when it starts.
CREATE TABLE user_achievements (
    user_id            INTEGER      NOT NULL,
    /* The achievement's ID on the wire, such as "noVariant10Wins". */
    achievement        TEXT         NOT NULL,
    /* When the game that unlocked the achievement finished. */
    datetime_unlocked  TIMESTAMPTZ  NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, achievement)
);
