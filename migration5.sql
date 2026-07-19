-- ============================================================
-- NotebookMind — Migration 5: fix XP sync (increment_points GRANT)
-- Run AFTER migrations 1-4. Idempotent.
--
-- Bug surfaced by test-backend.js:
--   The app's addPoints() calls the increment_points RPC to bump
--   profiles.points, but EXECUTE was never granted to the `authenticated`
--   role -> "permission denied for function increment_points". As a result
--   profiles.points never increased and the course leaderboard (which ranks
--   by profiles.points) showed 0 for everyone.
--
-- This grants EXECUTE on every increment_points overload in the public schema,
-- so it works regardless of the exact argument signature.
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_points'
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.sig || ' TO authenticated';
  END LOOP;
END $$;
