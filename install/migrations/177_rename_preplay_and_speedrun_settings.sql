-- Rename two settings to the names that the server now uses: "speedrunPreplay" is "preplay" and
-- "speedrunMode" is "speedrunFeatures". A server that reads a name it does not know uses the
-- default for it, so the server can run while this changes.
UPDATE users
SET settings = settings - 'speedrunPreplay' - 'speedrunMode'
    || jsonb_strip_nulls(jsonb_build_object(
        'preplay', settings -> 'speedrunPreplay',
        'speedrunFeatures', settings -> 'speedrunMode'
    ))
WHERE settings ?| ARRAY['speedrunPreplay', 'speedrunMode'];
