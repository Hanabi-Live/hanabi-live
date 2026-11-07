-- Average scores and strikeout counts are no longer shown or calculated (#3225).
ALTER TABLE user_stats DROP COLUMN average_score, DROP COLUMN num_strikeouts;
ALTER TABLE variant_stats DROP COLUMN average_score, DROP COLUMN num_strikeouts;
