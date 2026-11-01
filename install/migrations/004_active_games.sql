-- Go recovery checkpoints use reserved games.id values before the games row exists.
CREATE TABLE active_games (
    game_id integer PRIMARY KEY,
    revision bigint NOT NULL CHECK (revision > 0),
    checkpoint text NOT NULL
);
