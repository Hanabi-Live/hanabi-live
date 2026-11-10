-- `game_participants` stores a character's assigned metadata plus 1, so that 0 means none. The
-- Rust server, which first ran in production at 2026-11-07 06:04:25 UTC, stored it without the 1
-- until this release. Fuming, Dumbfounded, Inept, and Awkward are the characters with assigned
-- metadata. About 9 rows change.
UPDATE game_participants AS p
SET character_metadata = p.character_metadata + 1
FROM games AS g
WHERE g.id = p.game_id
  AND g.detrimental_characters
  AND g.datetime_finished >= '2026-11-07 06:04:25+00'
  AND p.character_assignment IN (0, 1, 2, 3);
