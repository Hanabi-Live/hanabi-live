-- Converts another range of table chat to plain text, as migration 179 explains.
CREATE OR REPLACE FUNCTION pg_temp.html_to_text(message TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
    SELECT replace(replace(replace(replace(replace(replace(replace(
        regexp_replace(
            regexp_replace(message, '<br ?/?>|<span class="cp">', E'\n', 'g'),
            '<[^>]*>', '', 'g'
        ),
        '&lt;', '<'), '&gt;', '>'), '&#34;', '"'), '&quot;', '"'), '&#39;', ''''), '&apos;', ''''),
        '&amp;', '&')
$$;

UPDATE chat_log
SET message = pg_temp.html_to_text(message)
WHERE table_id IS NOT NULL AND id >= 87000000 AND message ~ '[&<]';
