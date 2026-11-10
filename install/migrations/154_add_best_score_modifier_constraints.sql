-- A best score and its modifier are NULL together. The next migration validates the existing rows
-- without blocking writes.
ALTER TABLE user_stats
    ADD CONSTRAINT user_stats_best_score2_mod_check
        CHECK ((best_score2 IS NULL) = (best_score2_mod IS NULL)) NOT VALID,
    ADD CONSTRAINT user_stats_best_score3_mod_check
        CHECK ((best_score3 IS NULL) = (best_score3_mod IS NULL)) NOT VALID,
    ADD CONSTRAINT user_stats_best_score4_mod_check
        CHECK ((best_score4 IS NULL) = (best_score4_mod IS NULL)) NOT VALID,
    ADD CONSTRAINT user_stats_best_score5_mod_check
        CHECK ((best_score5 IS NULL) = (best_score5_mod IS NULL)) NOT VALID,
    ADD CONSTRAINT user_stats_best_score6_mod_check
        CHECK ((best_score6 IS NULL) = (best_score6_mod IS NULL)) NOT VALID;
