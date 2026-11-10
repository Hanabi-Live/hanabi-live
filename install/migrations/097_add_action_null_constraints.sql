-- Only a play or a discard has no value, and only a game over may have no target. The next
-- migration validates the existing rows without blocking writes.
ALTER TABLE game_actions
    ADD CONSTRAINT game_actions_value_check CHECK ((type IN (0, 1)) = (value IS NULL)) NOT VALID,
    ADD CONSTRAINT game_actions_target_check CHECK (target IS NOT NULL OR type IN (4, 5)) NOT VALID;
