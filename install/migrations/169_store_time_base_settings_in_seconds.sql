-- The "createTableTimeBaseMinutes" setting is now "createTableTimeBaseSeconds", in whole seconds.
-- About 1,200 users have one stored.
UPDATE users
SET settings = (settings - 'createTableTimeBaseMinutes') || CASE
    WHEN jsonb_typeof(settings->'createTableTimeBaseMinutes') = 'number' THEN jsonb_build_object(
        'createTableTimeBaseSeconds',
        round((settings->>'createTableTimeBaseMinutes')::numeric * 60)::bigint
    )
    ELSE '{}'::jsonb
END
WHERE settings ? 'createTableTimeBaseMinutes';
