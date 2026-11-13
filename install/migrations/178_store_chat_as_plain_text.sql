-- The lobby's chat and private messages were stored as escaped HTML. They are now plain text, which
-- clients escape. Table chat is not converted: the server never reads it back, and it is too large
-- to rewrite. Discord spoilers were stored as spans and are now Discord's "||" delimiters.
CREATE FUNCTION pg_temp.decode_html(message TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
    SELECT replace(replace(replace(replace(replace(replace(replace(message,
        '&lt;', '<'), '&gt;', '>'), '&#34;', '"'), '&quot;', '"'), '&#39;', ''''), '&apos;', ''''),
        '&amp;', '&')
$$;

UPDATE chat_log
SET message = pg_temp.decode_html(
    regexp_replace(message, '<span class="spoiler">(.*?)</span>', '||\1||', 'g')
)
WHERE table_id IS NULL AND message ~ '[&<]';

UPDATE chat_log_pm
SET message = pg_temp.decode_html(message)
WHERE message ~ '&';
