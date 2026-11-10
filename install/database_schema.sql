/**
 * Notes:
 * - The website uses PostgreSQL.
 * - Initializing the database is accomplished in the "install-database-schema.sh" script.
 * - "SERIAL" is a keyword in PostgreSQL to have an automatic-incrementing column:
 *   https://www.postgresqltutorial.com/postgresql-serial
 * - PostgreSQL automatically creates indexes for primary keys and unique constraints, but not
 *   foreign keys. Add other indexes explicitly to support query patterns.
 * - PostgreSQL automatically handles Unicode text, emojis, and so forth.
 * - "ON DELETE CASCADE" means that if the parent row is deleted, the child row will also be
 *   automatically deleted.
 */

/*
 * By default, PostgreSQL will show us notices about dropping tables (even with the "--quiet" flag
 * enabled). We only want messages to display on warnings or errors.
 */
SET client_min_messages TO WARNING;

DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE users (
    id                   SERIAL       PRIMARY KEY,
    username             TEXT         NOT NULL  UNIQUE,

    /**
     * PostgreSQL is not case-sensitive unique by default, meaning that it will allow a username of
     * "Alice" and "alice" to exist. Furthermore, because of Unicode, it would be possible for
     * "Αlice" with a Greek letter A (0x391) and "Alice" with a normal A (0x41) to exist. To guard
     * against users impersonating each other and phishing attacks, we also store a normalized
     * version of the username that is transliterated to ASCII and then lower-cased. Importantly, we
     * must verify that all new usernames are unique in code before adding them to the database.
     */
    normalized_username  TEXT         NOT NULL  UNIQUE,

    password_hash        TEXT         NULL, /* An Argon2id hash; NULL requires a password reset. */

    last_ip              TEXT         NOT NULL,
    datetime_created     TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    datetime_last_login  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),

    /* Games that ended normally, kept by the "count_normal_games_of_participant" triggers. */
    num_normal_games           INTEGER  NOT NULL  DEFAULT 0,
    num_normal_speedrun_games  INTEGER  NOT NULL  DEFAULT 0,

    /**
     * The settings a user changed, keyed by their client-facing names. The server supplies the
     * default for every setting that is not listed.
     */
    settings                   JSONB    NOT NULL  DEFAULT '{}',

    /* Set when the account authenticates with the bot client version. */
    is_bot                     BOOLEAN  NOT NULL  DEFAULT FALSE
);

/* User stats are per variant. */
DROP TABLE IF EXISTS user_stats CASCADE;
CREATE TABLE user_stats (
    user_id          INTEGER   NOT NULL,
    variant_id       SMALLINT  NOT NULL,
    num_games        INTEGER   NOT NULL  DEFAULT 0,
    /* Their best score for 2-player games on this variant. NULL when they have played none. */
    best_score2      SMALLINT  NULL,
    /* This stores if they used additional options to make the game easier. */
    best_score2_mod  SMALLINT  NOT NULL  DEFAULT 0,
    best_score3      SMALLINT  NULL,
    best_score3_mod  SMALLINT  NOT NULL  DEFAULT 0,
    best_score4      SMALLINT  NULL,
    best_score4_mod  SMALLINT  NOT NULL  DEFAULT 0,
    best_score5      SMALLINT  NULL,
    best_score5_mod  SMALLINT  NOT NULL  DEFAULT 0,
    best_score6      SMALLINT  NULL,
    best_score6_mod  SMALLINT  NOT NULL  DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, variant_id)
);

DROP TABLE IF EXISTS user_friends CASCADE;
CREATE TABLE user_friends (
    user_id    INTEGER  NOT NULL,
    friend_id  INTEGER  NOT NULL,
    FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, friend_id)
);

DROP TABLE IF EXISTS user_linkages;
CREATE TABLE user_linkages (
    user_id    INTEGER  NOT NULL,
    linked_id  INTEGER  NOT NULL,
    FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (linked_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, linked_id)
);

/* Blocked players cannot join or spectate each other's tables or exchange private messages. */
DROP TABLE IF EXISTS user_blocks CASCADE;
CREATE TABLE user_blocks (
    user_id     INTEGER  NOT NULL,
    blocked_id  INTEGER  NOT NULL,
    FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX user_blocks_index_blocked_id ON user_blocks (blocked_id);

DROP TABLE IF EXISTS user_identity_tokens CASCADE;
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

DROP TABLE IF EXISTS games CASCADE;
CREATE TABLE games (
    id                      SERIAL       PRIMARY KEY,
    name                    TEXT         NOT NULL,
    num_players             SMALLINT     NOT NULL,

    /* The ID for a particular variant can be found in the "variants.json" file. */
    variant_id              SMALLINT     NOT NULL,

    timed                   BOOLEAN      NOT NULL,
    /* In seconds. NULL when the game is untimed. */
    time_base               INTEGER      NULL,
    time_per_turn           INTEGER      NULL,
    speedrun                BOOLEAN      NOT NULL,
    deck_plays              BOOLEAN      NOT NULL,
    empty_clues             BOOLEAN      NOT NULL,
    one_extra_card          BOOLEAN      NOT NULL,
    one_less_card           BOOLEAN      NOT NULL,
    all_or_nothing          BOOLEAN      NOT NULL,
    detrimental_characters  BOOLEAN      NOT NULL,

    seed                    TEXT         NOT NULL, /* e.g. "p2v0s1" */
    score                   SMALLINT     NOT NULL,
    num_turns               SMALLINT     NOT NULL,

    /* See the "EndCondition" values in "server/engine/src/types.rs" / "EndCondition.ts". */
    end_condition           SMALLINT     NOT NULL,

    datetime_started        TIMESTAMPTZ  NOT NULL,
    datetime_finished       TIMESTAMPTZ  NOT NULL,
    CONSTRAINT games_time_base_check CHECK (timed = (time_base IS NOT NULL)),
    CONSTRAINT games_time_per_turn_check CHECK (timed = (time_per_turn IS NOT NULL))
);
CREATE INDEX games_index_num_players ON games (num_players);
CREATE INDEX games_index_seed        ON games (seed);
CREATE INDEX games_index_variant_id_score_id ON games (variant_id, score DESC, id DESC);

DROP TABLE IF EXISTS game_participants CASCADE;
CREATE TABLE game_participants (
    id                    SERIAL    PRIMARY KEY,
    game_id               INTEGER   NOT NULL,
    user_id               INTEGER   NOT NULL,
    seat                  SMALLINT  NOT NULL, /* 0-indexed. Orders the players and assigns their notes. */
    character_id          SMALLINT,           /* NULL when the player has no character. */
    assigned_metadata     SMALLINT,           /* NULL when the character has no assigned metadata. */
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT game_participants_unique UNIQUE (game_id, user_id)
);
CREATE INDEX game_participants_index_user_id_game_id ON game_participants (user_id, game_id);

DROP FUNCTION IF EXISTS delete_game_of_deleted_participant;
CREATE FUNCTION delete_game_of_deleted_participant() RETURNS TRIGGER AS $_$
BEGIN
DELETE FROM games WHERE games.id = OLD.game_id;
RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

CREATE TRIGGER delete_game_upon_participant_deletion
AFTER DELETE ON game_participants
FOR EACH ROW
EXECUTE PROCEDURE delete_game_of_deleted_participant();

DROP FUNCTION IF EXISTS count_normal_game_of_participant;
CREATE FUNCTION count_normal_game_of_participant() RETURNS TRIGGER AS $_$
DECLARE
    participant game_participants;
    change INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        participant := NEW;
        change := 1;
    ELSE
        participant := OLD;
        change := -1;
    END IF;
    /* A deleted game is no longer visible here, so "uncount_normal_game" counts it out instead. */
    UPDATE users SET
        num_normal_games = num_normal_games + CASE WHEN games.speedrun THEN 0 ELSE change END,
        num_normal_speedrun_games = num_normal_speedrun_games + CASE WHEN games.speedrun THEN change ELSE 0 END
    FROM games
    WHERE users.id = participant.user_id AND games.id = participant.game_id AND games.end_condition = 1;
    RETURN NULL;
END $_$ LANGUAGE 'plpgsql';

/* This name sorts before "delete_game_upon_participant_deletion", so it runs while the game exists. */
CREATE TRIGGER count_normal_games_of_participant
AFTER INSERT OR DELETE ON game_participants
FOR EACH ROW
EXECUTE PROCEDURE count_normal_game_of_participant();

DROP FUNCTION IF EXISTS uncount_normal_game;
CREATE FUNCTION uncount_normal_game() RETURNS TRIGGER AS $_$
BEGIN
    IF OLD.end_condition = 1 THEN
        UPDATE users SET
            num_normal_games = num_normal_games - CASE WHEN OLD.speedrun THEN 0 ELSE 1 END,
            num_normal_speedrun_games = num_normal_speedrun_games - CASE WHEN OLD.speedrun THEN 1 ELSE 0 END
        FROM game_participants
        WHERE game_participants.game_id = OLD.id AND users.id = game_participants.user_id;
    END IF;
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

CREATE TRIGGER uncount_normal_game_upon_deletion
BEFORE DELETE ON games
FOR EACH ROW
EXECUTE PROCEDURE uncount_normal_game();

DROP TABLE IF EXISTS game_participant_notes CASCADE;
CREATE TABLE game_participant_notes (
    game_participant_id  INTEGER   NOT NULL,
    card_order           SMALLINT  NOT NULL, /* "order" is a reserved word in PostgreSQL. */
    note                 TEXT      NOT NULL,
    FOREIGN KEY (game_participant_id) REFERENCES game_participants (id) ON DELETE CASCADE,
    PRIMARY KEY (game_participant_id, card_order)
);

DROP TABLE IF EXISTS game_actions CASCADE;
CREATE TABLE game_actions (
    game_id  INTEGER   NOT NULL,
    turn     SMALLINT  NOT NULL,

    /**
     * Corresponds to the "RecordedActionType" enum.
     *
     * - 0 - play
     * - 1 - discard
     * - 2 - color clue
     * - 3 - rank clue
     * - 4 - game over
     * - 5 - game over by vote
     */
    type     SMALLINT  NOT NULL,

    /**
     * - If a play or a discard, corresponds to the order of the the card that was played/discarded.
     * - If a clue, corresponds to the index of the player that received the clue.
     * - If a game over, corresponds to the index of the player that caused the game to end, or NULL
     *   if no player did.
     */
    target   SMALLINT  NULL,

    /**
     * - If a play or discard, then NULL.
     * - If a color clue, then 0 if red, 1 if yellow, etc.
     * - If a rank clue, then 1 if 1, 2 if 2, etc.
     * - If a game over, then the value corresponds to "EndCondition" in "server/engine/src/types.rs".
     */
    value    SMALLINT  NULL,

    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, turn),
    CONSTRAINT game_actions_value_check CHECK ((type IN (0, 1)) = (value IS NULL)),
    CONSTRAINT game_actions_target_check CHECK (target IS NOT NULL OR type IN (4, 5))
);

DROP TABLE IF EXISTS game_tags CASCADE;
CREATE TABLE game_tags (
    game_id  INTEGER  NOT NULL,
    user_id  INTEGER  NOT NULL,
    tag      TEXT     NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX game_tags_index_game_id_user_id ON game_tags (game_id, user_id);

DROP TABLE IF EXISTS seeds CASCADE;
CREATE TABLE seeds (
    seed       TEXT     NOT NULL  PRIMARY KEY,
    num_games  INTEGER  NOT NULL
);

DROP TABLE IF EXISTS variant_stats CASCADE;
CREATE TABLE variant_stats (
    /* The ID for a particular variant can be found in the "variants.json" file. */
    variant_id      SMALLINT  NOT NULL  PRIMARY KEY,
    num_games       INTEGER   NOT NULL  DEFAULT 0,
    /*
     * The best score from any team for a 2-player game on this variant without options. NULL when
     * there is no such game.
     */
    best_score2     SMALLINT  NULL,
    best_score3     SMALLINT  NULL,
    best_score4     SMALLINT  NULL,
    best_score5     SMALLINT  NULL,
    best_score6     SMALLINT  NULL,
    num_max_scores  INTEGER   NOT NULL  DEFAULT 0
);

DROP TABLE IF EXISTS chat_log CASCADE;
CREATE TABLE chat_log (
    id                  SERIAL       PRIMARY KEY,
    user_id             INTEGER      NULL,     /* NULL for server or Discord messages. */
    source              TEXT         NOT NULL CHECK (source IN ('user', 'server', 'discord')),
    discord_name        TEXT         NULL,     /* Only used if it is a Discord message. */
    discord_message_id  TEXT         NULL,     /* Discord snowflake, if the message came from Discord. */
    deleted_at          TIMESTAMPTZ  NULL,     /* Tombstone: do not show or restore removed messages. */
    message             TEXT         NOT NULL,
    room                TEXT         NOT NULL, /* Either "lobby" or "table####". */
    datetime_sent       TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    table_id            BIGINT       NULL,     /* The table whose chat this is; NULL for the lobby. */
    CONSTRAINT chat_log_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chat_log_user_id_check CHECK ((source = 'user') = (user_id IS NOT NULL))
);
CREATE INDEX chat_log_index_user_id          ON chat_log (user_id);
CREATE INDEX chat_log_index_room             ON chat_log (room);
CREATE INDEX chat_log_index_datetime_sent_id ON chat_log (datetime_sent, id);
CREATE INDEX chat_log_index_room_datetime_sent_id ON chat_log (room, datetime_sent, id)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX chat_log_index_discord_message_id ON chat_log (discord_message_id)
    WHERE discord_message_id IS NOT NULL;

/**
 * We want at least one entry in the "chat_log" table so that we can verify that we have
 * successfully connected to the database.
 */
INSERT INTO chat_log (
    user_id,
    source,
    discord_name,
    message,
    room
) VALUES (
    NULL,
    'discord',
    'Hanab Live',
    'The Hanab Live database has been successfully initialized.',
    'lobby'
);

DROP TABLE IF EXISTS chat_log_pm CASCADE;
CREATE TABLE chat_log_pm (
    id             SERIAL       PRIMARY KEY,
    user_id        INTEGER      NOT NULL,
    message        TEXT         NOT NULL,
    recipient_id   INTEGER      NOT NULL,
    datetime_sent  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX chat_log_pm_index_user_id          ON chat_log_pm (user_id);
CREATE INDEX chat_log_pm_index_recipient_id     ON chat_log_pm (recipient_id);
CREATE INDEX chat_log_pm_index_datetime_sent_id ON chat_log_pm (datetime_sent, id);

DROP TABLE IF EXISTS banned_ips CASCADE;
CREATE TABLE banned_ips (
    id               SERIAL       PRIMARY KEY,
    ip               TEXT         NOT NULL  UNIQUE,

    /* An entry for a banned IP can optionally be associated with a user. */
    user_id          INTEGER      NULL      DEFAULT NULL,

    /* An entry for a banned IP can optionally be associated with a reason. */
    reason           TEXT         NULL      DEFAULT NULL,

    datetime_banned  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX banned_ips_index_ip ON banned_ips (ip);

DROP TABLE IF EXISTS muted_ips CASCADE;
CREATE TABLE muted_ips (
    id               SERIAL       PRIMARY KEY,
    ip               TEXT         NOT NULL  UNIQUE,

    /* An entry for a muted IP can optionally be associated with a user. */
    user_id          INTEGER      NULL      DEFAULT NULL,

    /* An entry for a muted IP can optionally be associated with a reason. */
    reason           TEXT         NULL      DEFAULT NULL,

    datetime_banned  TIMESTAMPTZ  NOT NULL  DEFAULT NOW(),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX muted_ips_index_ip ON muted_ips (ip);

/* The latest checkpoint of each live table. */
DROP SEQUENCE IF EXISTS live_table_ids CASCADE;
CREATE SEQUENCE live_table_ids MAXVALUE 9007199254740991;

DROP TABLE IF EXISTS live_tables CASCADE;
CREATE TABLE live_tables (
    id        BIGINT  PRIMARY KEY,
    revision  BIGINT  NOT NULL  CHECK (revision >= 0),
    /* The checkpoint JSON. A table that is reserved but not saved yet has none. */
    payload   TEXT    NULL      CHECK ((revision = 0) = (payload IS NULL))
);

/*
 * A live table's game start, chat messages, game steps, and notes, each stored apart from its
 * checkpoint. A change then rewrites only the parts that changed. Keys are such as "game/start"
 * (the game's players and setup), "chat/3", "step/12", "notes/0" (a seat), and
 * "spectatorNotes/42" (a user ID).
 */
DROP TABLE IF EXISTS live_table_parts CASCADE;
CREATE TABLE live_table_parts (
    table_id  BIGINT  NOT NULL  REFERENCES live_tables (id) ON DELETE CASCADE,
    part      TEXT    NOT NULL,
    value     TEXT    NOT NULL,
    PRIMARY KEY (table_id, part)
);

