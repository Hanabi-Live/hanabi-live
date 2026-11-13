-- Table chat was stored as escaped HTML until migration 178. This turns it into plain text, as
-- migration 178 did for the lobby. A migration cannot commit partway, so migrations 179 to 182 each
-- convert a range of IDs, about 2 million rows. Line breaks and the indented lines of a proposal
-- become newlines, other tags go, and entities are decoded, "&amp;" last. The server never updates
-- these rows, so the updates lock nothing that it waits for. Run these with migration 178, before
-- the server that writes plain text starts, or they would change its new rows too.
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
WHERE table_id IS NOT NULL AND id < 71000000 AND message ~ '[&<]';
