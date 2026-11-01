-- Run without a transaction so the indexes can be built while the server is online.
CREATE INDEX CONCURRENTLY user_settings_index_user_id ON user_settings (user_id);
CREATE INDEX CONCURRENTLY game_tags_index_game_id_user_id ON game_tags (game_id, user_id);

-- Match the room filter and newest-first ordering used to retrieve visible chat history.
CREATE INDEX CONCURRENTLY chat_log_index_room_datetime_sent_id
    ON chat_log (room, datetime_sent, id)
    WHERE deleted_at IS NULL;
