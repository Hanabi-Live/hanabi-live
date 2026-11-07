-- Nothing reads these tables. user_reverse_friends mirrored user_friends, and metadata held a
-- placeholder row for the Go server's tests.
DROP TABLE user_reverse_friends;
DROP TABLE metadata;
