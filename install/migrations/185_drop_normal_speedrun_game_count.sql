-- Nothing reads "users.num_normal_speedrun_games" since the game history total became
-- "users.num_games", so stop counting it and drop it.

CREATE OR REPLACE FUNCTION count_game_of_participant() RETURNS TRIGGER AS $_$
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
    -- A deleted game is no longer visible here, so "uncount_game" counts it out instead.
    UPDATE users SET
        num_games = num_games + change,
        num_normal_games = num_normal_games
            + CASE WHEN games.end_condition = 1 AND NOT games.speedrun THEN change ELSE 0 END
    FROM games
    WHERE users.id = participant.user_id AND games.id = participant.game_id;
    RETURN NULL;
END $_$ LANGUAGE 'plpgsql';

CREATE OR REPLACE FUNCTION uncount_game() RETURNS TRIGGER AS $_$
BEGIN
    UPDATE users SET
        num_games = num_games - 1,
        num_normal_games = num_normal_games
            - CASE WHEN OLD.end_condition = 1 AND NOT OLD.speedrun THEN 1 ELSE 0 END
    FROM game_participants
    WHERE game_participants.game_id = OLD.id AND users.id = game_participants.user_id;
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

ALTER TABLE users DROP COLUMN num_normal_speedrun_games;
