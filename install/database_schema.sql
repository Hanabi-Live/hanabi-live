/*
 * Notes:
 * - Hanabi Live uses PostreSQL
 * - Initalizing the database is accomplished in the "install_database_schema.sh" script
 * - "SERIAL" is a keyword in PostgreSQL to have an automatic-incrementing column:
 *   https://www.postgresqltutorial.com/postgresql-serial
 * - PostgreSQL automatically creates indexes for columns with primary keys, foreign keys, and
 *   constraints, so we only have to bother explicitly creating a few indexes
 * - PostgreSQL automatically handles Unicode text, emojis, and so forth
 * - "ON DELETE CASCADE" means that if the parent row is deleted, the child row will also be
 *   automatically deleted
 */

/*
 * By default, PostgreSQL will show us notices about dropping tables (even with the "--quiet" flag
 * enabled); 
 * we only want messages to display on warnings or errors
 */
SET client_min_messages TO WARNING;

DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE users (
    id                   SERIAL       PRIMARY KEY,
    /*
     * CITEXT is case-insensitive text; we want users to be case-insensitive unique
     * (e.g. it should not be possible for both "Alice" and "alice" to exist)
     */
    username             CITEXT       NOT NULL  UNIQUE,
    /* TODO set "password_hash" to NOT NULL once password migration is complete for all users */
    password_hash        TEXT         NULL, /* An Argon2id hash */
    old_password_hash    TEXT         NULL, /* A SHA-256 hash */
    last_ip              TEXT         NOT NULL,
    datetime_created     TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    datetime_last_login  TIMESTAMPTZ  NOT NULL  DEFAULT NOW()
);

/* Any default settings must also be applied to the "userSettings.go" file */
DROP TABLE IF EXISTS user_settings CASCADE;
CREATE TABLE user_settings (
    user_id                             INTEGER   NOT NULL,
    desktop_notification                BOOLEAN   NOT NULL  DEFAULT FALSE,
    sound_move                          BOOLEAN   NOT NULL  DEFAULT TRUE,
    sound_timer                         BOOLEAN   NOT NULL  DEFAULT TRUE,
    keldon_mode                         BOOLEAN   NOT NULL  DEFAULT FALSE,
    colorblind_mode                     BOOLEAN   NOT NULL  DEFAULT FALSE,
    real_life_mode                      BOOLEAN   NOT NULL  DEFAULT FALSE,
    reverse_hands                       BOOLEAN   NOT NULL  DEFAULT FALSE,
    style_numbers                       BOOLEAN   NOT NULL  DEFAULT FALSE,
    show_timer_in_untimed               BOOLEAN   NOT NULL  DEFAULT FALSE,
    speedrun_preplay                    BOOLEAN   NOT NULL  DEFAULT FALSE,
    speedrun_mode                       BOOLEAN   NOT NULL  DEFAULT FALSE,
    hyphenated_conventions              BOOLEAN   NOT NULL  DEFAULT FALSE,
    volume                              SMALLINT  NOT NULL  DEFAULT 50,
    create_table_variant                TEXT      NOT NULL  DEFAULT 'No Variant',
    create_table_timed                  BOOLEAN   NOT NULL  DEFAULT FALSE,
    create_table_base_time_minutes      FLOAT     NOT NULL  DEFAULT 2,
    create_table_time_per_turn_seconds  INTEGER   NOT NULL  DEFAULT 20,
    create_table_speedrun               BOOLEAN   NOT NULL  DEFAULT FALSE,
    create_table_card_cycle             BOOLEAN   NOT NULL  DEFAULT FALSE,
    create_table_deck_plays             BOOLEAN   NOT NULL  DEFAULT FALSE,
    create_table_empty_clues            BOOLEAN   NOT NULL  DEFAULT FALSE,
    create_table_character_assignments  BOOLEAN   NOT NULL  DEFAULT FALSE,
    create_table_alert_waiters          BOOLEAN   NOT NULL  DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

/* User stats are per variant */
DROP TABLE IF EXISTS user_stats CASCADE;
CREATE TABLE user_stats (
    user_id          INTEGER   NOT NULL,
    variant          SMALLINT  NOT NULL,
    num_games        INTEGER   NOT NULL  DEFAULT 0,
    /* Their best score for 2-player games on this variant */
    best_score2      SMALLINT  NOT NULL  DEFAULT 0,
    /* This stores if they used additional options to make the game easier */
    best_score2_mod  SMALLINT  NOT NULL  DEFAULT 0,
    best_score3      SMALLINT  NOT NULL  DEFAULT 0,
    best_score3_mod  SMALLINT  NOT NULL  DEFAULT 0,
    best_score4      SMALLINT  NOT NULL  DEFAULT 0,
    best_score4_mod  SMALLINT  NOT NULL  DEFAULT 0,
    best_score5      SMALLINT  NOT NULL  DEFAULT 0,
    best_score5_mod  SMALLINT  NOT NULL  DEFAULT 0,
    best_score6      SMALLINT  NOT NULL  DEFAULT 0,
    best_score6_mod  SMALLINT  NOT NULL  DEFAULT 0,
    average_score    FLOAT     NOT NULL  DEFAULT 0,
    num_strikeouts   INTEGER   NOT NULL  DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, variant)
);

DROP TABLE IF EXISTS user_friends CASCADE;
CREATE TABLE user_friends (
    user_id    INTEGER  NOT NULL,
    friend_id  INTEGER  NOT NULL,
    FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, friend_id)
);

DROP TABLE IF EXISTS games CASCADE;
CREATE TABLE games (
    id                     SERIAL       PRIMARY KEY,
    name                   TEXT         NOT NULL,
    num_players            SMALLINT     NOT NULL,
    owner                  INTEGER      NOT NULL,
    /*
     * By default, the starting player is always at index (seat) 0
     * This field is only needed for legacy games before April 2020
     */
    starting_player        SMALLINT     NOT NULL  DEFAULT 0,
    /* Equal to the variant ID (found in "variants.json") */
    variant                SMALLINT     NOT NULL,
    timed                  BOOLEAN      NOT NULL,
    time_base              INTEGER      NOT NULL, /* in seconds */
    time_per_turn          INTEGER      NOT NULL, /* in seconds */
    speedrun               BOOLEAN      NOT NULL,
    card_cycle             BOOLEAN      NOT NULL,
    deck_plays             BOOLEAN      NOT NULL,
    empty_clues            BOOLEAN      NOT NULL,
    character_assignments  BOOLEAN      NOT NULL,
    seed                   TEXT         NOT NULL, /* e.g. "p2v0s1" */
    score                  SMALLINT     NOT NULL,
    num_turns              SMALLINT     NOT NULL,
    /* See the "endCondition" values in "constants.go" */
    end_condition          SMALLINT     NOT NULL,
    datetime_created       TIMESTAMPTZ  NOT NULL,
    datetime_started       TIMESTAMPTZ  NOT NULL,
    datetime_finished      TIMESTAMPTZ  NOT NULL,
    FOREIGN KEY (owner) REFERENCES users (id)
);
CREATE INDEX games_index_num_players ON games (num_players);
CREATE INDEX games_index_variant     ON games (variant);
CREATE INDEX games_index_seed        ON games (seed);

DROP TABLE IF EXISTS game_participants CASCADE;
CREATE TABLE game_participants (
    id                    SERIAL    PRIMARY KEY,
    game_id               INTEGER   NOT NULL,
    user_id               INTEGER   NOT NULL,
    seat                  SMALLINT  NOT NULL, /* Needed for the "GetNotes()" function */
    character_assignment  SMALLINT  NOT NULL,
    character_metadata    SMALLINT  NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT game_participants_unique UNIQUE (game_id, user_id)
);

DROP TABLE IF EXISTS game_participant_notes CASCADE;
CREATE TABLE game_participant_notes (
    game_participant_id  INTEGER   NOT NULL,
    card_order           SMALLINT  NOT NULL, /* "order" is a reserved word in PostgreSQL */
    note                 TEXT      NOT NULL,
    FOREIGN KEY (game_participant_id) REFERENCES game_participants (id) ON DELETE CASCADE,
    PRIMARY KEY (game_participant_id, card_order)
);

DROP TABLE IF EXISTS game_actions CASCADE;
CREATE TABLE game_actions (
    game_id  INTEGER   NOT NULL,
    turn     SMALLINT  NOT NULL,
    /* 0 - play, 1 - discard, 2 - color clue, 3 - number clue, 4 - game over */
    type     SMALLINT  NOT NULL,
    /*
     * If a play or a discard, then the order of the the card that was played/discarded
     * If a color clue or a number clue, then the index of the player that received the clue
     * If a game over, then the index of the player that caused the game to end
     */
    target   SMALLINT  NOT NULL,
    /*
     * If a play or discard, then 0 (as NULL)
     * It uses less database space and reduces code complexity to use a value of 0 for NULL
     * than to use a SQL NULL
     * https://dev.mysql.com/doc/refman/8.0/en/data-size.html
     * If a color clue, then 0 if red, 1 if yellow, etc.
     * If a rank clue, then 1 if 1, 2 if 2, etc.
     * If a game over, then the value corresponds to the "endCondition" values in "constants.go"
     */
    value    SMALLINT  NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, turn)
);

DROP TABLE IF EXISTS variant_stats CASCADE;
CREATE TABLE variant_stats (
    /* Equal to the variant ID (found in "variants.go") */
    variant         SMALLINT  NOT NULL  PRIMARY KEY,
    num_games       INTEGER   NOT NULL  DEFAULT 0,
    /* The overall best score for a 2-player games on this variant */
    best_score2     SMALLINT  NOT NULL  DEFAULT 0,
    best_score3     SMALLINT  NOT NULL  DEFAULT 0,
    best_score4     SMALLINT  NOT NULL  DEFAULT 0,
    best_score5     SMALLINT  NOT NULL  DEFAULT 0,
    best_score6     SMALLINT  NOT NULL  DEFAULT 0,
    num_max_scores  INTEGER   NOT NULL  DEFAULT 0,
    average_score   FLOAT     NOT NULL  DEFAULT 0,
    num_strikeouts  INTEGER   NOT NULL  DEFAULT 0
);

DROP TABLE IF EXISTS chat_log CASCADE;
CREATE TABLE chat_log (
    id             SERIAL       PRIMARY KEY,
    user_id        INTEGER      NOT NULL, /* 0 is a Discord message */
    discord_name   TEXT         NULL,     /* Only used if it is a Discord message */
    message        TEXT         NOT NULL,
    room           TEXT         NOT NULL, /* Either "lobby" or "table####" */
    datetime_sent  TIMESTAMPTZ  NOT NULL  DEFAULT NOW()
    /*
     * There is no foreign key for "user_id" because it would not exist for Discord messages or
     * server messages
     */
);
CREATE INDEX chat_log_index_user_id       ON chat_log (user_id);
CREATE INDEX chat_log_index_room          ON chat_log (room);
CREATE INDEX chat_log_index_datetime_sent ON chat_log (datetime_sent);

DROP TABLE IF EXISTS chat_log_pm CASCADE;
CREATE TABLE chat_log_pm (
    id             SERIAL       PRIMARY KEY,
    user_id        INTEGER      NOT NULL,
    message        TEXT         NOT NULL,
    recipient_id   INTEGER      NOT NULL,
    datetime_sent  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX chat_log_pm_index_user_id       ON chat_log_pm (user_id);
CREATE INDEX chat_log_pm_index_recipient_id  ON chat_log_pm (recipient_id);
CREATE INDEX chat_log_pm_index_datetime_sent ON chat_log_pm (datetime_sent);

DROP TABLE IF EXISTS banned_ips CASCADE;
CREATE TABLE banned_ips (
    id               SERIAL       PRIMARY KEY,
    ip               TEXT         NOT NULL,
    /* An entry for a banned IP can optionally be associated with a user */
    user_id          INTEGER      NULL      DEFAULT NULL,
    reason           TEXT         NULL      DEFAULT NULL,
    datetime_banned  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS muted_ips CASCADE;
CREATE TABLE muted_ips (
    id               SERIAL       PRIMARY KEY,
    ip               TEXT         NOT NULL,
    /* An entry for a muted IP can optionally be associated with a user */
    user_id          INTEGER      NULL      DEFAULT NULL,
    reason           TEXT         NULL      DEFAULT NULL,
    datetime_banned  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS throttled_ips CASCADE;
CREATE TABLE throttled_ips (
    id                  SERIAL       PRIMARY KEY,
    ip                  TEXT         NOT NULL,
    /* An entry for a throttled IP can optionally be associated with a user */
    user_id             INTEGER      NULL      DEFAULT NULL,
    reason              TEXT         NULL      DEFAULT NULL,
    datetime_throttled  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS discord_metadata CASCADE;
CREATE TABLE discord_metadata (
    id     SERIAL  PRIMARY KEY,
    name   TEXT    NOT NULL  UNIQUE,
    value  TEXT    NOT NULL
);
/* The "last_at_here" value is stored as a RFC3339 string */
INSERT INTO discord_metadata (name, value) VALUES ('last_at_here', '2006-01-02T15:04:05Z');

DROP TABLE IF EXISTS discord_waiters CASCADE;
CREATE TABLE discord_waiters (
    id                SERIAL       PRIMARY KEY,
    username          TEXT         NOT NULL,
    discord_mention   TEXT         NOT NULL,
    datetime_expired  TIMESTAMPTZ  NOT NULL
);
