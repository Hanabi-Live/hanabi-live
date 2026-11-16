-- Store the version of each user's sessions. Session cookies carry the version that they were
-- signed with, and a password change increases it, which ends the user's other sessions.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
