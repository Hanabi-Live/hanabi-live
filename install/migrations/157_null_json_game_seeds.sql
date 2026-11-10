-- Three games from January 2023 were imported with their own decks and stored "JSON" as their seed.
-- They have no seed, and no other game shares one with them, so the seed statistics drop the "JSON"
-- row.
UPDATE games SET seed = NULL WHERE seed = 'JSON';
DELETE FROM seeds WHERE seed = 'JSON';
