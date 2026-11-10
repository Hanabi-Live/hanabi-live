-- Fourteen tags from an older server are empty, which the server no longer allows. A constraint
-- keeps them out; the next migration validates it without blocking writes.
DELETE FROM game_tags WHERE tag = '';
ALTER TABLE game_tags ADD CONSTRAINT game_tags_tag_check CHECK (tag <> '') NOT VALID;
