/*
    Setting up the database is accomplished in the "install_database_schema.sh" script
*/

USE hanabi;

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

DROP TABLE IF EXISTS user_stats;
CREATE TABLE user_stats (
    id               INT  NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    user_id          INT    NOT NULL,
    variant          INT    NOT NULL, /* Equal to the variant ID (found in "variants.go") */
    num_played       INT    NOT NULL  DEFAULT 0,
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
    strikeout_rate   FLOAT  NOT NULL  DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    /* If the user is deleted, automatically delete all of their stats */
);
CREATE INDEX user_stats_index_user_id ON user_stats (user_id);

DROP TABLE IF EXISTS games;
CREATE TABLE games (
    id                 INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    name                   NVARCHAR(50)  NOT NULL,
    num_players            TINYINT       NOT NULL,
    owner                  INT           NOT NULL,
    variant                INT           NOT NULL, /* Equal to the variant ID (found in "variants.go") */
    timed                  BOOLEAN       NOT NULL, /* 0 - not timed, 1 - timed */
    time_base              INT           NOT NULL, /* in seconds */
    time_per_turn          INT           NOT NULL, /* in seconds */
    deck_plays             BOOLEAN       NOT NULL,
    empty_clues            BOOLEAN       NOT NULL,
    character_assignments  BOOLEAN       NOT NULL,
    seed                   VARCHAR(50)   NOT NULL, /* like "p2v0s1" */
    score                  INT           NOT NULL,
    num_turns              INT           NOT NULL,
    end_condition          INT           NOT NULL, /* 0 - in progress, 1 - normal, 2 - strikeout, 3 - timeout, 4 - abandoned */
    datetime_created       TIMESTAMP     NOT NULL,
    datetime_started       TIMESTAMP     NOT NULL,
    datetime_finished      TIMESTAMP     NOT NULL  DEFAULT NOW(),
    FOREIGN KEY (owner) REFERENCES users (id)
);
CREATE INDEX games_index_num_players ON games (num_players);
CREATE INDEX games_index_variant ON games (variant);
CREATE INDEX games_index_seed ON games (seed);

DROP TABLE IF EXISTS game_participants;
CREATE TABLE game_participants (
    id       INT              NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    user_id               INT              NOT NULL,
    game_id               INT              NOT NULL,
    notes                 NVARCHAR(10000)  NOT NULL,
    character_assignment  INT              NOT NULL,
    character_metadata    INT              NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
    /* If the game is deleted, automatically delete all of the game participant rows */
);
CREATE INDEX game_participants_index_user_id ON game_participants (user_id);
CREATE INDEX game_participants_index_game_id ON game_participants (game_id);

DROP TABLE IF EXISTS game_actions;
CREATE TABLE game_actions (
    id       INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    game_id  INT            NOT NULL,
    action   VARCHAR(1500)  NOT NULL, /* JSON */
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
    /* If the game is deleted, automatically delete all of the game action rows */
);
CREATE INDEX game_actions_index_game_id ON game_actions (game_id);

DROP TABLE IF EXISTS chat_log;
CREATE TABLE chat_log (
    id             INT             NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    user_id        INT             NOT NULL, /* 0 is a Discord message */
    discord_name   NVARCHAR(150)   NULL, /* only used if it is a Discord message */
    room           NVARCHAR(50)    NOT NULL, /* either "lobby" or "game-####" */
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
    /* If the user is deleted, automatically delete the banned_ips entry */
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
