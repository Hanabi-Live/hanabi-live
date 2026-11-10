-- A play or a discard has a NULL value instead of 0, and a game over that no player caused has a
-- NULL target instead of -1. This batch covers the game IDs from 1433929 to 1521510, at most about
-- 2 million of the 49 million rows that change. The server never changes saved actions, so the
-- update blocks nothing. The pause first gives live queries the disk between batches.
SELECT pg_sleep(15);
UPDATE game_actions SET
    value = CASE WHEN type IN (0, 1) THEN NULL ELSE value END,
    target = CASE WHEN type IN (4, 5) AND target = -1 THEN NULL ELSE target END
WHERE game_id >= 1433929 AND game_id < 1521511
  AND ((type IN (0, 1) AND value IS NOT NULL) OR (type IN (4, 5) AND target = -1));
