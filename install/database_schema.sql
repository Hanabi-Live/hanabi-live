/*
    mysql -uhanabiuser -p1234567890 < install/database_schema.sql
*/

DROP DATABASE IF EXISTS hanabi;
CREATE DATABASE hanabi;
USE hanabi;

CREATE TABLE users (
    id                INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT, /* PRIMARY KEY automatically creates a UNIQUE constraint */
    username          NVARCHAR(19)  NOT NULL  UNIQUE, /* MySQL is case insensitive by default, which is what we want */
    password          CHAR(64)      NOT NULL, /* A SHA-256 hash string is 64 characters long */
    num_played        INT           NOT NULL  DEFAULT 0,
    average_score     INT           NOT NULL  DEFAULT 0,
    loss_percent      INT           NOT NULL  DEFAULT 0,
    datetime_created  TIMESTAMP     NOT NULL, /* Defaults to the current time */
    last_login        TIMESTAMP     NOT NULL /* Defaults to the current time */
);
CREATE INDEX users_index_username ON users (username);

CREATE TABLE games (
    id                 INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT, /* PRIMARY KEY automatically creates a UNIQUE constraint */
    name               NVARCHAR(50)  NOT NULL,
    owner              INT           NOT NULL,
    max_players        TINYINT       NOT NULL, /* 2-5 */
    variant            TINYINT       NOT NULL, /* 0 - none, 1 - black, 2 - black one of each, 3 - rainbow */
    allow_spec         BOOLEAN       NOT NULL, /* 0 - no, 1 - yes */
    timed              BOOLEAN       NOT NULL, /* 0 - not timed, 1 - timed */
    status             TINYINT       NOT NULL, /* 0 - open, 1 - in progress, 2 - finished */
    seed               VARCHAR(15)   NULL,
    score              INT           NULL,
    datetime_created   TIMESTAMP     NOT NULL, /* Defaults to the current time */
    datetime_started   TIMESTAMP     NULL      DEFAULT NULL,
    datetime_finished  TIMESTAMP     NULL      DEFAULT NULL,
    FOREIGN KEY (owner) REFERENCES users (id)
);
CREATE INDEX games_index_status ON games (status);

CREATE TABLE game_participants (
    id               INT        NOT NULL  PRIMARY KEY  AUTO_INCREMENT, /* PRIMARY KEY automatically creates a UNIQUE constraint */
    user_id          INT        NOT NULL,
    game_id          INT        NOT NULL,
    datetime_joined  TIMESTAMP  NOT NULL, /* Defaults to the current time */
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
    /* If the game is deleted, automatically delete all of the game participant rows */
);
CREATE INDEX game_participants_index_user_id ON game_participants (user_id);
CREATE INDEX game_participants_index_game_id ON game_participants (game_id);
CREATE INDEX game_participants_index_datetime_joined ON game_participants (datetime_joined);

CREATE TABLE game_actions (
    id               INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT, /* PRIMARY KEY automatically creates a UNIQUE constraint */
    game_id          INT           NOT NULL,
    action           VARCHAR(500)  NOT NULL, /* JSON */
    datetime_action  TIMESTAMP     NOT NULL, /* Defaults to the current time */
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
    /* If the game is deleted, automatically delete all of the game participant rows */
);
CREATE INDEX game_actions_index_game_id ON game_actions (game_id);

CREATE TABLE chat_log (
    id               INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT, /* PRIMARY KEY automatically creates a UNIQUE constraint */
    user_id          INT            NOT NULL,
    message          NVARCHAR(150)  NOT NULL,
    datetime_sent    TIMESTAMP      NOT NULL, /* Defaults to the current time */
    FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE INDEX chat_log_index_user_id ON chat_log (user_id);
CREATE INDEX chat_log_index_datetime_sent ON chat_log (datetime_sent);
