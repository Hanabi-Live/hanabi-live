-- Reads every tag without blocking writes.
ALTER TABLE game_tags VALIDATE CONSTRAINT game_tags_tag_check;
