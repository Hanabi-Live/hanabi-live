-- NOT VALID does not check existing rows, so the table is locked only for a moment.
-- Migration 044 checks them without blocking reads or writes.
ALTER TABLE chat_log
    ADD CONSTRAINT chat_log_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE NOT VALID,
    ADD CONSTRAINT chat_log_user_id_check
        CHECK ((source = 'user') = (user_id IS NOT NULL)) NOT VALID;
