-- ============================================================
-- NotebookMind — Migration 9: per-course leaderboard XP
-- Run AFTER migrations 1-8. Idempotent.
--
-- Problem: point_events had no course scope, and get_course_leaderboard ranked
-- enrolled students by profiles.points — the GLOBAL total. So XP earned in one
-- course lifted a student's rank in every other course they were in.
--
-- Fix: tag each point event with the course it was earned in, and rank the
-- course leaderboard by the SUM of that course's point_events only. The global
-- profiles.points still exists (personal lifetime XP shown on home/profile); it
-- is just no longer what the course ranking uses.
-- ============================================================

-- ─── Course scope on point events ────────────────────────────
ALTER TABLE public.point_events
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS point_events_course
  ON public.point_events(course_id, user_id);

-- ─── Per-course leaderboard RPC ──────────────────────────────
-- SECURITY DEFINER so an enrolled student can see classmates' ranks without
-- reading course_enrollments / other users' point_events directly. Only
-- opted-in, enrolled members appear; ranking is this course's XP only.
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
  WITH course_xp AS (
    SELECT
      pe.user_id,
      COALESCE(SUM(pe.points), 0)::int AS points,
      COALESCE(
        SUM(pe.points) FILTER (WHERE pe.created_at >= now() - interval '7 days'),
        0
      )::int AS weekly_points
    FROM public.point_events pe
    WHERE pe.course_id = p_course_id
    GROUP BY pe.user_id
  )
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY COALESCE(cx.points, 0) DESC, COALESCE(cx.weekly_points, 0) DESC
    ) AS rank,
    COALESCE(p.display_name, 'Anonymous') AS display_name,
    p.username,
    COALESCE(cx.points, 0) AS points,
    COALESCE(cx.weekly_points, 0) AS weekly_points
  FROM public.course_enrollments e
  JOIN public.profiles p ON p.user_id = e.user_id
  LEFT JOIN course_xp cx ON cx.user_id = e.user_id
  WHERE e.course_id = p_course_id
    AND p.leaderboard_opt_in = true
  ORDER BY COALESCE(cx.points, 0) DESC, COALESCE(cx.weekly_points, 0) DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_course_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_leaderboard(uuid) TO authenticated;
