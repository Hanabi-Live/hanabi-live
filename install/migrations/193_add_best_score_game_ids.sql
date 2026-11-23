-- The game that set each best score in user_stats: the first game with that score and modifier.
-- They are not foreign keys, so that deleting a game does not search this table. A reader checks
-- that the game still exists and has the score.
ALTER TABLE user_stats
    ADD COLUMN best_score2_game_id INTEGER NULL,
    ADD COLUMN best_score3_game_id INTEGER NULL,
    ADD COLUMN best_score4_game_id INTEGER NULL,
    ADD COLUMN best_score5_game_id INTEGER NULL,
    ADD COLUMN best_score6_game_id INTEGER NULL;
