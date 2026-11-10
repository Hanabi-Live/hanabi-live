-- A variant's best score is NULL for a player count without a game without options, since 0 is also
-- a score. The options are the ones that `ScoreModifier` names.
CREATE TEMPORARY TABLE played ON COMMIT DROP AS
SELECT DISTINCT variant_id, num_players
FROM games
WHERE NOT (deck_plays OR empty_clues OR one_extra_card OR one_less_card OR all_or_nothing);
UPDATE variant_stats AS v SET
    best_score2 = CASE
        WHEN v.best_score2 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p WHERE p.variant_id = v.variant_id AND p.num_players = 2
        ) THEN NULL
        ELSE v.best_score2
    END,
    best_score3 = CASE
        WHEN v.best_score3 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p WHERE p.variant_id = v.variant_id AND p.num_players = 3
        ) THEN NULL
        ELSE v.best_score3
    END,
    best_score4 = CASE
        WHEN v.best_score4 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p WHERE p.variant_id = v.variant_id AND p.num_players = 4
        ) THEN NULL
        ELSE v.best_score4
    END,
    best_score5 = CASE
        WHEN v.best_score5 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p WHERE p.variant_id = v.variant_id AND p.num_players = 5
        ) THEN NULL
        ELSE v.best_score5
    END,
    best_score6 = CASE
        WHEN v.best_score6 = 0 AND NOT EXISTS (
            SELECT 1 FROM played AS p WHERE p.variant_id = v.variant_id AND p.num_players = 6
        ) THEN NULL
        ELSE v.best_score6
    END
WHERE 0 IN (v.best_score2, v.best_score3, v.best_score4, v.best_score5, v.best_score6);
