/*
    Notes:
    - Installing the database is accomplished in the "install_database_schema.sh" script
    - MariaDB will automatically create a UNIQUE constraint for a column with a PRIMARY KEY
    - MariaDB automatically creates indexes for columns with primary keys, foreign keys, and
      constraints, so we only have to bother explicitly creating a few indexes
    - "VARCHAR" is equivalent to "NVARCHAR", so we do not have to worry about Unicode fields;
      see: https://mariadb.com/kb/en/varchar/
    - "ON DELETE CASCADE" means that if the parent row is deleted, the child row will also be
      automatically deleted
*/

/*
    We have to disable foreign key checks so that we can drop the tables;
    this will only disable it for the current session
 */
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id                   INT          NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* MySQL enforces case insensitive uniqueness by default, which is what we want */
    username             VARCHAR(20)  NOT NULL  UNIQUE,
    password             CHAR(64)     NOT NULL, /* A SHA-256 hash string is 64 characters long */
    last_ip              VARCHAR(40)  NULL, /* This will be set immediately after insertion */
    admin                BOOLEAN      NOT NULL  DEFAULT 0,
    muted                BOOLEAN      NOT NULL  DEFAULT 0,
    tester               BOOLEAN      NOT NULL  DEFAULT 0,
    datetime_created     TIMESTAMP    NOT NULL  DEFAULT NOW(),
    datetime_last_login  TIMESTAMP    NOT NULL  DEFAULT NOW()
);
CREATE INDEX users_index_username ON users (username);

/* Any default settings must also be applied to the "userSettings.go" file */
DROP TABLE IF EXISTS user_settings;
CREATE TABLE user_settings (
    user_id                             INT          NOT NULL  PRIMARY KEY,
    sound_move                          BOOLEAN      NOT NULL  DEFAULT 1,
    sound_timer                         BOOLEAN      NOT NULL  DEFAULT 1,
    keldon_mode                         BOOLEAN      NOT NULL  DEFAULT 0,
    colorblind_mode                     BOOLEAN      NOT NULL  DEFAULT 0,
    real_life_mode                      BOOLEAN      NOT NULL  DEFAULT 0,
    reverse_hands                       BOOLEAN      NOT NULL  DEFAULT 0,
    style_numbers                       BOOLEAN      NOT NULL  DEFAULT 0,
    show_timer_in_untimed               BOOLEAN      NOT NULL  DEFAULT 0,
    volume                              TINYINT      NOT NULL  DEFAULT 50,
    speedrun_preplay                    BOOLEAN      NOT NULL  DEFAULT 0,
    speedrun_mode                       BOOLEAN      NOT NULL  DEFAULT 0,
    hyphenated_conventions              BOOLEAN      NOT NULL  DEFAULT 0,
    create_table_variant                VARCHAR(50)  NOT NULL  DEFAULT "No Variant",
    create_table_timed                  BOOLEAN      NOT NULL  DEFAULT 0,
    create_table_base_time_minutes      FLOAT        NOT NULL  DEFAULT 2,
    create_table_time_per_turn_seconds  INT          NOT NULL  DEFAULT 20,
    create_table_speedrun               BOOLEAN      NOT NULL  DEFAULT 0,
    create_table_card_cycle             BOOLEAN      NOT NULL  DEFAULT 0,
    create_table_deck_plays             BOOLEAN      NOT NULL  DEFAULT 0,
    create_table_empty_clues            BOOLEAN      NOT NULL  DEFAULT 0,
    create_table_character_assignments  BOOLEAN      NOT NULL  DEFAULT 0,
    create_table_alert_waiters          BOOLEAN      NOT NULL  DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS user_stats; /* Stats are per variant */
CREATE TABLE user_stats (
    user_id          INT       NOT NULL,
    variant          SMALLINT  NOT NULL,
    num_games        INT       NOT NULL  DEFAULT 0,
    /* Their best score for 2-player games on this variant */
    best_score2      TINYINT   NOT NULL  DEFAULT 0,
    /* This stores if they used additional options to make the game easier */
    best_score2_mod  TINYINT   NOT NULL  DEFAULT 0,
    best_score3      TINYINT   NOT NULL  DEFAULT 0,
    best_score3_mod  TINYINT   NOT NULL  DEFAULT 0,
    best_score4      TINYINT   NOT NULL  DEFAULT 0,
    best_score4_mod  TINYINT   NOT NULL  DEFAULT 0,
    best_score5      TINYINT   NOT NULL  DEFAULT 0,
    best_score5_mod  TINYINT   NOT NULL  DEFAULT 0,
    best_score6      TINYINT   NOT NULL  DEFAULT 0,
    best_score6_mod  TINYINT   NOT NULL  DEFAULT 0,
    average_score    FLOAT     NOT NULL  DEFAULT 0,
    num_strikeouts   INT       NOT NULL  DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, variant)
);

DROP TABLE IF EXISTS games;
CREATE TABLE games (
    id                     INT          NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    name                   VARCHAR(50)  NOT NULL,
    num_players            TINYINT      NOT NULL,
    owner                  INT          NOT NULL,
    /* Equal to the variant ID (found in "variants.json") */
    variant                SMALLINT     NOT NULL,
    timed                  BOOLEAN      NOT NULL, /* 0 - not timed, 1 - timed */
    time_base              INT          NOT NULL, /* in seconds */
    time_per_turn          INT          NOT NULL, /* in seconds */
    speedrun               BOOLEAN      NOT NULL,
    card_cycle             BOOLEAN      NOT NULL,
    deck_plays             BOOLEAN      NOT NULL,
    empty_clues            BOOLEAN      NOT NULL,
    character_assignments  BOOLEAN      NOT NULL,
    seed                   VARCHAR(50)  NOT NULL, /* e.g. "p2v0s1" */
    score                  TINYINT      NOT NULL,
    num_turns              SMALLINT     NOT NULL,
    /* 0 - in progress, 1 - normal, 2 - strikeout, 3 - timeout, 4 - abandoned */
    end_condition          TINYINT      NOT NULL,
    datetime_created       TIMESTAMP    NOT NULL,
    datetime_started       TIMESTAMP    NOT NULL,
    datetime_finished      TIMESTAMP    NOT NULL,
    FOREIGN KEY (owner) REFERENCES users (id)
);
CREATE INDEX games_index_num_players ON games (num_players);
CREATE INDEX games_index_variant ON games (variant);
CREATE INDEX games_index_seed ON games (seed);

DROP TABLE IF EXISTS game_participants;
CREATE TABLE game_participants (
    id                    INT      NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    user_id               INT      NOT NULL,
    game_id               INT      NOT NULL,
    seat                  TINYINT  NOT NULL,
    character_assignment  TINYINT  NOT NULL,
    character_metadata    TINYINT  NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    CONSTRAINT game_participants_unique UNIQUE (user_id, game_id)
);

DROP TABLE IF EXISTS game_participant_notes;
CREATE TABLE game_participant_notes (
    game_participants_id  INT            NOT NULL,
    card_order            TINYINT        NOT NULL, /* "order" is a reserved word */
    note                  VARCHAR(1000)  NOT NULL,
    FOREIGN KEY (game_participants_id) REFERENCES game_participants (id) ON DELETE CASCADE,
    PRIMARY KEY (game_participants_id, card_order)
);

DROP TABLE IF EXISTS game_actions;
CREATE TABLE game_actions (
    id       INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    game_id  INT            NOT NULL,
    action   VARCHAR(1500)  NOT NULL, /* JSON */
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
);

/* Eventually this table will replace the "game_actions" table */
DROP TABLE IF EXISTS game_actions2;
CREATE TABLE game_actions2 (
    game_id    INT      NOT NULL,
    turn       TINYINT  NOT NULL,
    type       TINYINT  NOT NULL, /* 0 - number clue, 1 - color clue, 2 - play, 3 - discard */
    target     TINYINT  NOT NULL, /* The index of the player that received the clue or the card that was played/discarded */
    clue_giver TINYINT  NOT NULL, /* The index of the player that performed the clue */
    clue_value TINYINT  NOT NULL, /* 1 if 1, 2 if 2, etc., or 1 if blue, 2 if etc. */
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, turn)
);

DROP TABLE IF EXISTS variant_stats;
CREATE TABLE variant_stats (
    variant             SMALLINT  NOT NULL  PRIMARY KEY, /* Equal to the variant ID (found in "variants.go") */
    num_games           INT       NOT NULL  DEFAULT 0,
    best_score2         TINYINT   NOT NULL  DEFAULT 0, /* The overall best score for a 2-player games on this variant */
    best_score3         TINYINT   NOT NULL  DEFAULT 0,
    best_score4         TINYINT   NOT NULL  DEFAULT 0,
    best_score5         TINYINT   NOT NULL  DEFAULT 0,
    best_score6         TINYINT   NOT NULL  DEFAULT 0,
    num_max_scores      INT       NOT NULL  DEFAULT 0,
    average_score       FLOAT     NOT NULL  DEFAULT 0,
    num_strikeouts      INT       NOT NULL  DEFAULT 0
);

DROP TABLE IF EXISTS chat_log;
CREATE TABLE chat_log (
    id             INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    user_id        INT            NOT NULL, /* 0 is a Discord message */
    discord_name   VARCHAR(150)   NULL,     /* only used if it is a Discord message */
    message        VARCHAR(1000)  NOT NULL,
    room           VARCHAR(50)    NOT NULL, /* either "lobby" or "table####" */
    datetime_sent  TIMESTAMP      NOT NULL  DEFAULT NOW()
    /* There is no foreign key for "user_id" because it would not exist for Discord messages */
);
CREATE INDEX chat_log_index_user_id ON chat_log (user_id);
CREATE INDEX chat_log_index_room ON chat_log (room);
CREATE INDEX chat_log_index_datetime_sent ON chat_log (datetime_sent);

DROP TABLE IF EXISTS chat_log_pm;
CREATE TABLE chat_log_pm (
    id             INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    user_id        INT            NOT NULL,
    message        VARCHAR(1000)  NOT NULL,
    recipient_id   INT            NOT NULL,
    datetime_sent  TIMESTAMP      NOT NULL  DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX chat_log_pm_index_user_id ON chat_log_pm (user_id);
CREATE INDEX chat_log_pm_index_recipient_id ON chat_log_pm (recipient_id);
CREATE INDEX chat_log_index_datetime_sent ON chat_log_pm (datetime_sent);

DROP TABLE IF EXISTS banned_ips;
CREATE TABLE banned_ips (
    id                 INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    ip                 VARCHAR(40)   NOT NULL,
    user_id            INT           NULL      DEFAULT NULL,
    /* If specified, this IP address is associated with the respective user */
    admin_responsible  INT           NOT NULL,
    reason             VARCHAR(150)  NULL      DEFAULT NULL,
    datetime_banned    TIMESTAMP     NOT NULL  DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(admin_responsible) REFERENCES users(id)
);

DROP TABLE IF EXISTS discord_metadata;
CREATE TABLE discord_metadata (
    id     INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    name   VARCHAR(20)   NOT NULL  UNIQUE,
    value  VARCHAR(100)  NOT NULL
);
CREATE INDEX discord_metadata_index_name ON discord_metadata (name);
INSERT INTO discord_metadata (name, value) VALUES ('last_at_here', '2006-01-02T15:04:05Z07:00');
/* The "last_at_here" value is stored as a RFC3339 string */

DROP TABLE IF EXISTS discord_waiters;
CREATE TABLE discord_waiters (
    id                INT          NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    username          VARCHAR(30)  NOT NULL,
    discord_mention   VARCHAR(30)  NOT NULL,
    datetime_expired  TIMESTAMP    NOT NULL
);
