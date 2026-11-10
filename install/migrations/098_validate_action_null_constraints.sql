-- Reads every saved action, which takes a few minutes. It does not block reads or writes.
ALTER TABLE game_actions VALIDATE CONSTRAINT game_actions_value_check;
ALTER TABLE game_actions VALIDATE CONSTRAINT game_actions_target_check;
