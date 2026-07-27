-- ============================================================
-- NotebookMind — Migration 20: enable Supabase Realtime
-- Run AFTER migrations 1-19. Idempotent.
--
-- Adds the collaboration tables to the `supabase_realtime` publication so the
-- app can subscribe to live changes (postgres_changes) and update without a
-- reload: the teacher dashboard when a student joins or submits, Explain-mode
-- comments in both directions, and friend requests. Realtime still respects RLS,
-- so a subscriber only receives rows it is allowed to SELECT.
--
-- REPLICA IDENTITY FULL makes UPDATE/DELETE events carry the full old row, which
-- is needed for client-side filters (e.g. friend withdraw = a DELETE) to match.
-- ============================================================

-- The publication exists by default on Supabase; create it if somehow missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'course_enrollments','notebook_submissions','cell_attempts',
    'cell_comments','friend_shares','course_notebooks'
  ] LOOP
    -- Full row on UPDATE/DELETE so realtime filters can match old values.
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    -- Add to the realtime publication if not already a member.
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
