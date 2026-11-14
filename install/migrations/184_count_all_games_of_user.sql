-- Keep "users.num_games" exact with the triggers that keep the counts of normal games, and fill it
-- in.

-- Saving a game writes to "games" before checking "users", so take these locks first to avoid a
-- deadlock with a game that finishes during this migration. Such a game waits, then is counted.
LOCK TABLE games, game_participants IN SHARE ROW EXCLUSIVE MODE;

DROP TRIGGER count_normal_games_of_participant ON game_participants;
DROP FUNCTION count_normal_game_of_participant;
DROP TRIGGER uncount_normal_game_upon_deletion ON games;
DROP FUNCTION uncount_normal_game;

CREATE FUNCTION count_game_of_participant() RETURNS TRIGGER AS $_$
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
            + CASE WHEN games.end_condition = 1 AND NOT games.speedrun THEN change ELSE 0 END,
        num_normal_speedrun_games = num_normal_speedrun_games
            + CASE WHEN games.end_condition = 1 AND games.speedrun THEN change ELSE 0 END
    FROM games
    WHERE users.id = participant.user_id AND games.id = participant.game_id;
    RETURN NULL;
END $_$ LANGUAGE 'plpgsql';

-- This name sorts before "delete_game_upon_participant_deletion", so it runs while the game exists.
CREATE TRIGGER count_games_of_participant
AFTER INSERT OR DELETE ON game_participants
FOR EACH ROW
EXECUTE PROCEDURE count_game_of_participant();

CREATE FUNCTION uncount_game() RETURNS TRIGGER AS $_$
BEGIN
    UPDATE users SET
        num_games = num_games - 1,
        num_normal_games = num_normal_games
            - CASE WHEN OLD.end_condition = 1 AND NOT OLD.speedrun THEN 1 ELSE 0 END,
        num_normal_speedrun_games = num_normal_speedrun_games
            - CASE WHEN OLD.end_condition = 1 AND OLD.speedrun THEN 1 ELSE 0 END
    FROM game_participants
    WHERE game_participants.game_id = OLD.id AND users.id = game_participants.user_id;
    RETURN OLD;
END $_$ LANGUAGE 'plpgsql';

CREATE TRIGGER uncount_game_upon_deletion
BEFORE DELETE ON games
FOR EACH ROW
EXECUTE PROCEDURE uncount_game();

-- Count first, so that the rows of "users" are locked only while they are updated.
CREATE TEMPORARY TABLE game_counts ON COMMIT DROP AS
SELECT user_id, count(*) AS num_games FROM game_participants GROUP BY user_id;

UPDATE users SET num_games = game_counts.num_games
FROM game_counts
WHERE users.id = game_counts.user_id;
