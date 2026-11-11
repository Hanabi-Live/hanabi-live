-- The "soundMove" setting is now a name instead of a number. About 650 users have one stored.
UPDATE users
SET settings = jsonb_set(
    settings,
    '{soundMove}',
    CASE settings->>'soundMove'
        WHEN '1' THEN '"onlyOwn"'::jsonb
        WHEN '2' THEN '"none"'::jsonb
        ELSE '"all"'::jsonb
    END
)
WHERE jsonb_typeof(settings->'soundMove') = 'number';
