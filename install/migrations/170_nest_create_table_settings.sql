-- The "Create Game" form's twelve "createTable..." settings become one "createTable" object, whose
-- "options" are a game's options. About 14,000 users have one of them stored. A value that is not
-- valid takes its default, as it did before. The defaults here are those of this release.
CREATE TEMPORARY TABLE converted ON COMMIT DROP AS
WITH old AS (
    SELECT
        id,
        settings AS s,
        jsonb_build_object(
            'baseSeconds', CASE
                WHEN jsonb_typeof(settings->'createTableTimeBaseSeconds') = 'number'
                    AND (settings->>'createTableTimeBaseSeconds')::numeric
                        = round((settings->>'createTableTimeBaseSeconds')::numeric)
                    AND (settings->>'createTableTimeBaseSeconds')::numeric BETWEEN 0 AND 604800
                THEN settings->'createTableTimeBaseSeconds'
                ELSE '120'
            END,
            'perTurnSeconds', CASE
                WHEN jsonb_typeof(settings->'createTableTimePerTurnSeconds') = 'number'
                    AND (settings->>'createTableTimePerTurnSeconds')::numeric
                        = round((settings->>'createTableTimePerTurnSeconds')::numeric)
                    AND (settings->>'createTableTimePerTurnSeconds')::numeric BETWEEN 0 AND 86400
                THEN settings->'createTableTimePerTurnSeconds'
                ELSE '20'
            END
        ) AS clock
    FROM users
    WHERE settings ?| ARRAY[
        'createTableMaxPlayers', 'createTableVariant', 'createTableTimed',
        'createTableTimeBaseSeconds', 'createTableTimePerTurnSeconds', 'createTableSpeedrun',
        'createTableDeckPlays', 'createTableEmptyClues', 'createTableOneExtraCard',
        'createTableOneLessCard', 'createTableAllOrNothing', 'createTableDetrimentalCharacters'
    ]
        AND NOT settings ? 'createTable'
)
SELECT
    id,
    jsonb_build_object(
        'maxPlayers', CASE
            WHEN s->'createTableMaxPlayers' IN ('2', '3', '4', '5', '6')
            THEN s->'createTableMaxPlayers'
            ELSE '5'
        END,
        'options', jsonb_build_object(
            'variantName', CASE
                WHEN jsonb_typeof(s->'createTableVariant') = 'string'
                    AND s->>'createTableVariant' <> ''
                THEN s->'createTableVariant'
                ELSE '"No Variant"'
            END,
            'speedrun', coalesce(s->'createTableSpeedrun' = 'true', false),
            'deckPlays', coalesce(s->'createTableDeckPlays' = 'true', false),
            'emptyClues', coalesce(s->'createTableEmptyClues' = 'true', false),
            'oneExtraCard', coalesce(s->'createTableOneExtraCard' = 'true', false),
            'oneLessCard', coalesce(s->'createTableOneLessCard' = 'true', false),
            'allOrNothing', coalesce(s->'createTableAllOrNothing' = 'true', false),
            'detrimentalCharacters', coalesce(s->'createTableDetrimentalCharacters' = 'true', false)
        ) || CASE
            WHEN coalesce(s->'createTableTimed' = 'true', false) THEN jsonb_build_object('timeControl', clock)
            ELSE '{}'
        END,
        'timeControl', clock
    ) AS create_table
FROM old;

-- The server writes users, so update them last. A user who saved the form since then has
-- "createTable" already, and keeps it.
UPDATE users
SET settings = settings
    - ARRAY[
        'createTableMaxPlayers', 'createTableVariant', 'createTableTimed',
        'createTableTimeBaseSeconds', 'createTableTimePerTurnSeconds', 'createTableSpeedrun',
        'createTableDeckPlays', 'createTableEmptyClues', 'createTableOneExtraCard',
        'createTableOneLessCard', 'createTableAllOrNothing', 'createTableDetrimentalCharacters'
    ]
    || CASE
        WHEN converted.create_table = '{
            "maxPlayers": 5,
            "options": {
                "variantName": "No Variant", "speedrun": false, "deckPlays": false,
                "emptyClues": false, "oneExtraCard": false, "oneLessCard": false,
                "allOrNothing": false, "detrimentalCharacters": false
            },
            "timeControl": {"baseSeconds": 120, "perTurnSeconds": 20}
        }'::jsonb
        THEN '{}'
        ELSE jsonb_build_object('createTable', converted.create_table)
    END
FROM converted
WHERE users.id = converted.id
    AND NOT users.settings ? 'createTable';
