-- A best score's modifier is NULL when there is no best score. This batch covers the user IDs from
-- 28,202 to 39,625, about 37,000 of the 447,000 rows of `user_stats`. The pause first leaves the
-- disk to live queries. The update only writes values, so the server's stats updates wait on its
-- row locks for only a moment.
SELECT pg_sleep(5);
UPDATE user_stats SET
    best_score2_mod = CASE WHEN best_score2 IS NULL THEN NULL ELSE best_score2_mod END,
    best_score3_mod = CASE WHEN best_score3 IS NULL THEN NULL ELSE best_score3_mod END,
    best_score4_mod = CASE WHEN best_score4 IS NULL THEN NULL ELSE best_score4_mod END,
    best_score5_mod = CASE WHEN best_score5 IS NULL THEN NULL ELSE best_score5_mod END,
    best_score6_mod = CASE WHEN best_score6 IS NULL THEN NULL ELSE best_score6_mod END
WHERE user_id >= 28202 AND user_id < 39626
  AND (
    (best_score2 IS NULL AND best_score2_mod IS NOT NULL)
    OR (best_score3 IS NULL AND best_score3_mod IS NOT NULL)
    OR (best_score4 IS NULL AND best_score4_mod IS NOT NULL)
    OR (best_score5 IS NULL AND best_score5_mod IS NOT NULL)
    OR (best_score6 IS NULL AND best_score6_mod IS NOT NULL)
  );
