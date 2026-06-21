-- ============================================================
-- NotebookMind — Migration 3: opt-in, course-scoped leaderboard
-- Run AFTER supabase-migration.sql and migration2.sql.
-- ============================================================

-- ─── Opt-in flag (leaderboards must be opt-in, not default-on) ─
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT false;

-- ─── Course-scoped leaderboard RPC ───────────────────────────
-- SECURITY DEFINER so an enrolled student can see classmates' ranks
-- without being able to read the course_enrollments rows directly.
-- Only opted-in profiles are returned, and only to enrolled members
-- or the course's teacher.
CREATE OR REPLACE FUNCTION public.get_course_leaderboard(p_course_id uuid)
RETURNS TABLE (
  rank bigint,
  display_name text,
  username text,
  points integer,
  weekly_points integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be enrolled in the course or be its teacher.
  IF NOT EXISTS (
    SELECT 1 FROM public.course_enrollments e
      WHERE e.course_id = p_course_id AND e.user_id = auth.uid()
    UNION
    SELECT 1 FROM public.courses c
      WHERE c.id = p_course_id AND c.teacher_id = auth.uid()
  ) THEN
    RETURN; -- not a member: empty result
  END IF;

  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY p.points DESC, p.weekly_points DESC) AS rank,
    COALESCE(p.display_name, 'Anonymous') AS display_name,
    p.username,
    p.points,
    p.weekly_points
  FROM public.profiles p
  JOIN public.course_enrollments e ON e.user_id = p.user_id
  WHERE e.course_id = p_course_id
    AND p.leaderboard_opt_in = true
  ORDER BY p.points DESC, p.weekly_points DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_course_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_leaderboard(uuid) TO authenticated;
