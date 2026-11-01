-- Run without a transaction so the index can be built while games are in progress.
-- Supports user game counts and history lookups, including friends' histories.
CREATE INDEX CONCURRENTLY game_participants_index_user_id_game_id
    ON game_participants (user_id, game_id);
