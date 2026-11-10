-- Reads every row of `user_stats` without blocking writes.
ALTER TABLE user_stats VALIDATE CONSTRAINT user_stats_best_score2_mod_check;
ALTER TABLE user_stats VALIDATE CONSTRAINT user_stats_best_score3_mod_check;
ALTER TABLE user_stats VALIDATE CONSTRAINT user_stats_best_score4_mod_check;
ALTER TABLE user_stats VALIDATE CONSTRAINT user_stats_best_score5_mod_check;
ALTER TABLE user_stats VALIDATE CONSTRAINT user_stats_best_score6_mod_check;
