-- Nothing but the app reads or writes the tables.
--
-- Supabase publishes the public schema through its Data API (PostgREST) to the anon and
-- authenticated roles, whose key is public by design. The app reaches the database only
-- through Prisma, connected as the tables' owner, which row-level security does not bind.
--
-- 1. Row-level security on every table, with no policies: every other role gets no rows.
-- 2. On Supabase (where the roles exist), their grants on the tables taken away, now and for
--    tables created later. Elsewhere (local, CI) there is nothing to revoke.
-- A table added later needs row-level security too: an integration test fails without it.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;
