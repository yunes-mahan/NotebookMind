-- ============================================================
-- NotebookMind — Migration 4: fix API-role GRANTs + RLS recursion
-- Run AFTER migrations 1-3. Idempotent.
--
-- Two bugs surfaced by TEST_PLAN.ipynb:
--  1) PostgREST needs table-level GRANTs to anon/authenticated (RLS alone
--     is not enough) -> "permission denied for table ...".
--  2) The courses <-> course_enrollments policies referenced each other,
--     causing "infinite recursion detected in policy".
-- ============================================================

-- ─── 1) API-role privileges (RLS still gates the actual rows) ──
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ─── 2) SECURITY DEFINER helpers break the policy cycle ───────
-- These run as the owner (bypassing RLS), so referencing them inside a
-- policy does not re-trigger the other table's policy.
CREATE OR REPLACE FUNCTION public.is_enrolled(p_course uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_enrollments
    WHERE course_id = p_course AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_course_teacher(p_course uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = p_course AND teacher_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_enrolled(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_course_teacher(uuid) TO anon, authenticated;

-- ─── Rewrite the recursive policies to use the helpers ────────
DROP POLICY IF EXISTS "Courses readable by enrolled or teacher" ON public.courses;
CREATE POLICY "Courses readable by enrolled or teacher" ON public.courses
  FOR SELECT USING (auth.uid() = teacher_id OR public.is_enrolled(id));

DROP POLICY IF EXISTS "Teachers view course enrollments" ON public.course_enrollments;
CREATE POLICY "Teachers view course enrollments" ON public.course_enrollments
  FOR SELECT USING (public.is_course_teacher(course_id));

DROP POLICY IF EXISTS "Enrolled students read course docs" ON public.documents;
CREATE POLICY "Enrolled students read course docs" ON public.documents
  FOR SELECT USING (
    is_course_material = false
    OR auth.uid() = user_id
    OR public.is_enrolled(course_id)
    OR public.is_course_teacher(course_id)
  );

DROP POLICY IF EXISTS "Anyone enrolled or teacher reads weeks" ON public.course_weeks;
CREATE POLICY "Anyone enrolled or teacher reads weeks" ON public.course_weeks
  FOR SELECT USING (public.is_course_teacher(course_id) OR public.is_enrolled(course_id));

DROP POLICY IF EXISTS "Teachers manage weeks" ON public.course_weeks;
CREATE POLICY "Teachers manage weeks" ON public.course_weeks
  FOR ALL USING (public.is_course_teacher(course_id));

DROP POLICY IF EXISTS "Enrolled/teacher reads notebooks" ON public.course_notebooks;
CREATE POLICY "Enrolled/teacher reads notebooks" ON public.course_notebooks
  FOR SELECT USING (public.is_course_teacher(course_id) OR public.is_enrolled(course_id));

DROP POLICY IF EXISTS "Teachers manage notebooks" ON public.course_notebooks;
CREATE POLICY "Teachers manage notebooks" ON public.course_notebooks
  FOR ALL USING (public.is_course_teacher(course_id));

DROP POLICY IF EXISTS "Teachers view course submissions (anon agg only)" ON public.notebook_submissions;
CREATE POLICY "Teachers view course submissions (anon agg only)" ON public.notebook_submissions
  FOR SELECT USING (public.is_course_teacher(course_id));

DROP POLICY IF EXISTS "Teachers read cell attempts for their courses" ON public.cell_attempts;
CREATE POLICY "Teachers read cell attempts for their courses" ON public.cell_attempts
  FOR SELECT USING (course_id IS NULL OR public.is_course_teacher(course_id));
