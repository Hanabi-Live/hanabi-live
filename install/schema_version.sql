-- Only used after installing the complete schema into a fresh database.
CREATE TABLE IF NOT EXISTS public.schema_version (
    version INTEGER PRIMARY KEY
);
TRUNCATE public.schema_version;
INSERT INTO public.schema_version (version) VALUES (:migration_version);
