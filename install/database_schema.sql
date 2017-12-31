/*
    Setting up the database is covered in the README.md file
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
    username             NVARCHAR(19)  NOT NULL  UNIQUE, /* MySQL is case insensitive by default, which is what we want */
    password             CHAR(64)      NOT NULL, /* A SHA-256 hash string is 64 characters long */
    last_ip              VARCHAR(40)   NULL, /* This will be set immediately after insertion */
    datetime_created     TIMESTAMP     NOT NULL  DEFAULT NOW(),
    datetime_last_login  TIMESTAMP     NOT NULL  DEFAULT NOW()
);
CREATE INDEX users_index_username ON users (username);

DROP TABLE IF EXISTS games;
CREATE TABLE games (
    id                 INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    name               NVARCHAR(50)  NOT NULL,
    owner              INT           NOT NULL,
    variant            TINYINT       NOT NULL, /* 0 - none, 1 - black, 2 - black one of each, 3 - rainbow */
    timed              BOOLEAN       NOT NULL, /* 0 - not timed, 1 - timed */
    time_base          INT           NOT NULL, /* in seconds */
    time_per_turn      INT           NOT NULL, /* in seconds */
    seed               VARCHAR(15)   NOT NULL, /* like "p2v0s1" */
    score              INT           NOT NULL,
    end_condition      INT           NOT NULL, /* 0 - in progress, 1 - normal, 2 - strikeout, 3 - timeout, 4 - abandoned */
    datetime_created   TIMESTAMP     NOT NULL,
    datetime_started   TIMESTAMP     NOT NULL,
    datetime_finished  TIMESTAMP     NOT NULL  DEFAULT NOW(),
    FOREIGN KEY (owner) REFERENCES users (id)
);
CREATE INDEX games_index_datetime_finished ON games (datetime_finished);

DROP TABLE IF EXISTS game_participants;
CREATE TABLE game_participants (
    id               INT              NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    user_id          INT              NOT NULL,
    game_id          INT              NOT NULL,
    notes            NVARCHAR(10000)  NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
    /* If the game is deleted, automatically delete all of the game participant rows */
);
CREATE INDEX game_participants_index_user_id ON game_participants (user_id);
CREATE INDEX game_participants_index_game_id ON game_participants (game_id);

DROP TABLE IF EXISTS game_actions;
CREATE TABLE game_actions (
    id               INT           NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    game_id          INT           NOT NULL,
    action           VARCHAR(500)  NOT NULL, /* JSON */
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
    /* If the game is deleted, automatically delete all of the game action rows */
);
CREATE INDEX game_actions_index_game_id ON game_actions (game_id);

DROP TABLE IF EXISTS chat_log;
CREATE TABLE chat_log (
    id               INT            NOT NULL  PRIMARY KEY  AUTO_INCREMENT,
    /* PRIMARY KEY automatically creates a UNIQUE constraint */
    user_id          INT            NOT NULL, /* 0 is a Discord message */
    message          NVARCHAR(150)  NOT NULL,
    datetime_sent    TIMESTAMP      NOT NULL  DEFAULT NOW()
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
