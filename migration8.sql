-- ============================================================
-- NotebookMind — Migration 8: students can leave a course
-- Run AFTER migrations 1-7. Idempotent.
--
-- course_enrollments had INSERT (enroll self) and SELECT policies but no
-- DELETE, so "leave course" only removed the course locally and it reappeared
-- on next login. This lets a user remove their own enrollment.
-- ============================================================

DROP POLICY IF EXISTS "Users leave courses" ON public.course_enrollments;
CREATE POLICY "Users leave courses" ON public.course_enrollments
  FOR DELETE USING (user_id = auth.uid());
