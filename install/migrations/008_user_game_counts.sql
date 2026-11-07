-- Store each player's count of games that ended normally, so that lobby and pregame statistics do
-- not recount every game a player has finished. Triggers keep the counts exact.

-- Saving a game writes to "games" before checking "users", so take these locks first to avoid a
-- deadlock with a game that finishes during this migration. Such a game waits, then is counted.
LOCK TABLE games, game_participants IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE users
    ADD COLUMN num_normal_games INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN num_normal_speedrun_games INTEGER NOT NULL DEFAULT 0;

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
    -- A deleted game is no longer visible here, so "uncount_normal_game" counts it out instead.
    UPDATE users SET
        num_normal_games = num_normal_games + CASE WHEN games.speedrun THEN 0 ELSE change END,
        num_normal_speedrun_games = num_normal_speedrun_games + CASE WHEN games.speedrun THEN change ELSE 0 END
    FROM games
    WHERE users.id = participant.user_id AND games.id = participant.game_id AND games.end_condition = 1;
    RETURN NULL;
END $_$ LANGUAGE 'plpgsql';

-- This name sorts before "delete_game_upon_participant_deletion", so it runs while the game exists.
CREATE TRIGGER count_normal_games_of_participant
AFTER INSERT OR DELETE ON game_participants
FOR EACH ROW
EXECUTE PROCEDURE count_normal_game_of_participant();

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

UPDATE users SET
    num_normal_games = counts.normal,
    num_normal_speedrun_games = counts.speedrun
FROM (
    SELECT
        game_participants.user_id,
        count(*) FILTER (WHERE NOT games.speedrun) AS normal,
        count(*) FILTER (WHERE games.speedrun) AS speedrun
    FROM game_participants
    JOIN games ON games.id = game_participants.game_id
    WHERE games.end_condition = 1
    GROUP BY game_participants.user_id
) AS counts
WHERE users.id = counts.user_id;
