/*
    Setting up the database is accomplished in the "install_database_schema.sh" script
*/

/*
    We have to disable foreign key checks so that we can drop the tables;
    this will only disable it for the current session
 */
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id                   INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    username             NVARCHAR(20)  NOT NULL  UNIQUE, /* MySQL is case insensitive by default, which is what we want */
    password             CHAR(64)      NOT NULL, /* A SHA-256 hash string is 64 characters long */
    last_ip              VARCHAR(40)   NULL, /* This will be set immediately after insertion */
    admin                INT           NOT NULL  DEFAULT 0,
    tester               INT           NOT NULL  DEFAULT 0,
    datetime_created     TIMESTAMP     NOT NULL  DEFAULT NOW(),
    datetime_last_login  TIMESTAMP     NOT NULL  DEFAULT NOW()
);
CREATE INDEX users_index_username ON users (username);

/* Any default settings must also be applied to the "userSettings.go" file */
DROP TABLE IF EXISTS user_settings;
CREATE TABLE user_settings (
    user_id                             INT          NOT NULL  PRIMARY KEY,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    sound_move                          BOOLEAN      NOT NULL  DEFAULT 1,
    sound_timer                         BOOLEAN      NOT NULL  DEFAULT 1,
    keldon_mode                         BOOLEAN      NOT NULL  DEFAULT 0,
    colorblind_mode                     BOOLEAN      NOT NULL  DEFAULT 0,
    real_life_mode                      BOOLEAN      NOT NULL  DEFAULT 0,
    reverse_hands                       BOOLEAN      NOT NULL  DEFAULT 0,
    legible_numbers                     BOOLEAN      NOT NULL  DEFAULT 0,
    show_timer_in_untimed               BOOLEAN      NOT NULL  DEFAULT 0,
    volume                              INT          NOT NULL  DEFAULT 50,
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
    /* If the user is deleted, automatically delete all of the rows */
);

DROP TABLE IF EXISTS user_stats; /* Stats are per variant */
CREATE TABLE user_stats (
    user_id          INT    NOT NULL,
    variant          INT    NOT NULL,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    num_games        INT    NOT NULL  DEFAULT 0,
    best_score2      INT    NOT NULL  DEFAULT 0, /* Their best score for 2-player games on this variant */
    best_score2_mod  INT    NOT NULL  DEFAULT 0, /* This stores if they used additional options to make the game easier */
    best_score3      INT    NOT NULL  DEFAULT 0,
    best_score3_mod  INT    NOT NULL  DEFAULT 0,
    best_score4      INT    NOT NULL  DEFAULT 0,
    best_score4_mod  INT    NOT NULL  DEFAULT 0,
    best_score5      INT    NOT NULL  DEFAULT 0,
    best_score5_mod  INT    NOT NULL  DEFAULT 0,
    best_score6      INT    NOT NULL  DEFAULT 0,
    best_score6_mod  INT    NOT NULL  DEFAULT 0,
    average_score    FLOAT  NOT NULL  DEFAULT 0,
    num_strikeouts   FLOAT  NOT NULL  DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    /* If the user is deleted, automatically delete all of the rows */
    PRIMARY KEY (user_id, variant) 
);

DROP TABLE IF EXISTS games;
CREATE TABLE games (
    id                     INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    name                   NVARCHAR(50)  NOT NULL,
    num_players            TINYINT       NOT NULL,
    owner                  INT           NOT NULL,
    variant                INT           NOT NULL, /* Equal to the variant ID (found in "variants.json") */
    timed                  BOOLEAN       NOT NULL, /* 0 - not timed, 1 - timed */
    time_base              INT           NOT NULL, /* in seconds */
    time_per_turn          INT           NOT NULL, /* in seconds */
    speedrun               BOOLEAN       NOT NULL,
    card_cycle             BOOLEAN       NOT NULL,
    deck_plays             BOOLEAN       NOT NULL,
    empty_clues            BOOLEAN       NOT NULL,
    character_assignments  BOOLEAN       NOT NULL,
    seed                   VARCHAR(50)   NOT NULL, /* e.g. "p2v0s1" */
    score                  INT           NOT NULL,
    num_turns              INT           NOT NULL,
    end_condition          INT           NOT NULL, /* 0 - in progress, 1 - normal, 2 - strikeout, 3 - timeout, 4 - abandoned */
    datetime_created       TIMESTAMP     NOT NULL,
    datetime_started       TIMESTAMP     NOT NULL,
    datetime_finished      TIMESTAMP     NOT NULL,
    FOREIGN KEY (owner) REFERENCES users (id)
);
CREATE INDEX games_index_num_players ON games (num_players);
CREATE INDEX games_index_variant ON games (variant);
CREATE INDEX games_index_seed ON games (seed);

DROP TABLE IF EXISTS game_participants;
CREATE TABLE game_participants (
    user_id               INT              NOT NULL,
    game_id               INT              NOT NULL,
    seat                  TINYINT          NOT NULL,
    notes                 NVARCHAR(10000)  NOT NULL,
    character_assignment  INT              NOT NULL,
    character_metadata    INT              NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    /* If the game is deleted, automatically delete all of the rows */
    PRIMARY KEY (user_id, game_id)
);

DROP TABLE IF EXISTS game_actions;
CREATE TABLE game_actions (
    id       INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    game_id  INT            NOT NULL,
    action   VARCHAR(1500)  NOT NULL, /* JSON */
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
    /* If the game is deleted, automatically delete all of the rows */
);
CREATE INDEX game_actions_index_game_id ON game_actions (game_id);

/* Eventually this table will replace the "game_actions" table */
DROP TABLE IF EXISTS game_actions2;
CREATE TABLE game_actions2 (
    game_id    INT      NOT NULL,
    turn       TINYINT  NOT NULL,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    type       TINYINT  NOT NULL, /* 0 - clue, 1 - play, 2 - discard */
    target     TINYINT  NOT NULL, /* The index of the player that received the clue or the card that was played/discarded */
    clue_giver TINYINT  NOT NULL, /* The index of the player that performed the clue */
    clue_type  TINYINT  NOT NULL, /* 0 - number, 1 - color */
    clue_value TINYINT  NOT NULL, /* 1 if 1, 2 if 2, etc., or 1 if blue, 2 if etc. */
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    /* If the game is deleted, automatically delete all of the rows */
    PRIMARY KEY (game_id, turn)
);

DROP TABLE IF EXISTS variant_stats;
CREATE TABLE variant_stats (
    variant             INT    NOT NULL  PRIMARY KEY, /* Equal to the variant ID (found in "variants.go") */
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    num_games           INT    NOT NULL  DEFAULT 0,
    best_score2         INT    NOT NULL  DEFAULT 0, /* The overall best score for a 2-player games on this variant */
    best_score3         INT    NOT NULL  DEFAULT 0,
    best_score4         INT    NOT NULL  DEFAULT 0,
    best_score5         INT    NOT NULL  DEFAULT 0,
    best_score6         INT    NOT NULL  DEFAULT 0,
    num_max_scores      INT    NOT NULL  DEFAULT 0,
    average_score       FLOAT  NOT NULL  DEFAULT 0,
    num_strikeouts      INT    NOT NULL  DEFAULT 0
);

DROP TABLE IF EXISTS chat_log;
CREATE TABLE chat_log (
    id             INT             NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    user_id        INT             NOT NULL, /* 0 is a Discord message */
    discord_name   NVARCHAR(150)   NULL, /* only used if it is a Discord message */
    room           NVARCHAR(50)    NOT NULL, /* either "lobby" or "table####" */
    message        NVARCHAR(1000)  NOT NULL,
    datetime_sent  TIMESTAMP       NOT NULL  DEFAULT NOW()
);
CREATE INDEX chat_log_index_user_id ON chat_log (user_id);
CREATE INDEX chat_log_index_datetime_sent ON chat_log (datetime_sent);

DROP TABLE IF EXISTS banned_ips;
CREATE TABLE banned_ips (
    id                 INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    ip                 VARCHAR(40)    NOT NULL,
    user_id            INT            NULL      DEFAULT NULL,
    /* If specified, this IP address is associated with the respective user */
    admin_responsible  INT            NOT NULL,
    reason             NVARCHAR(150)  NULL      DEFAULT NULL,
    datetime_banned    TIMESTAMP      NOT NULL  DEFAULT NOW(),

    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    /* If the user is deleted, automatically delete all of the rows */
    FOREIGN KEY(admin_responsible) REFERENCES users(id)
);

DROP TABLE IF EXISTS discord_metadata;
CREATE TABLE discord_metadata (
    id     INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    name   VARCHAR(20)    NOT NULL  UNIQUE,
    value  NVARCHAR(100)  NOT NULL
);
CREATE INDEX discord_metadata_index_name ON discord_metadata (name);
INSERT INTO discord_metadata (name, value) VALUES ('last_at_here', '2006-01-02T15:04:05Z07:00');
/* The "last_at_here" value is stored as a RFC3339 string */

DROP TABLE IF EXISTS discord_waiters;
CREATE TABLE discord_waiters (
    id                INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    username          NVARCHAR(30)  NOT NULL,
    discord_mention   VARCHAR(30)   NOT NULL,
    datetime_expired  TIMESTAMP     NOT NULL
);
