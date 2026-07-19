-- ============================================================
-- NotebookMind — Migration 6: join a course by invite code
-- Run AFTER migrations 1-5. Idempotent.
--
-- A student who is not yet enrolled cannot SELECT a course (RLS requires
-- enrollment/teacher), so they can't look it up by invite code to join.
-- This SECURITY DEFINER RPC resolves the course by code and enrolls the
-- caller in one step, bypassing the chicken-and-egg RLS problem.
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_course_by_invite(p_code text)
RETURNS TABLE (id uuid, name text, code text, invite_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_code text;
  v_invite text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN; -- must be signed in
  END IF;

  SELECT c.id, c.name, c.code, c.invite_code
    INTO v_id, v_name, v_code, v_invite
  FROM public.courses c
  WHERE upper(c.invite_code) = upper(trim(p_code))
    AND c.is_active
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN; -- no such course
  END IF;

  INSERT INTO public.course_enrollments (user_id, course_id)
  VALUES (auth.uid(), v_id)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_id, v_name, v_code, v_invite;
END;
$$;

REVOKE ALL ON FUNCTION public.join_course_by_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_course_by_invite(text) TO authenticated;
