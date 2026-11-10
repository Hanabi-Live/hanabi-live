-- Copy the characters of games with detrimental characters into the new columns, about 7,200 rows.
-- The players of other games have no character, which the new columns' NULL already says. Fuming,
-- Dumbfounded, Inept, and Awkward are the characters with assigned metadata, which
-- `character_metadata` stores plus 1.
UPDATE game_participants AS p
SET character_id = p.character_assignment,
    assigned_metadata = CASE
        WHEN p.character_assignment IN (0, 1, 2, 3) AND p.character_metadata > 0
        THEN p.character_metadata - 1
    END
FROM games AS g
WHERE g.id = p.game_id
  AND g.detrimental_characters
  AND p.character_assignment >= 0;
