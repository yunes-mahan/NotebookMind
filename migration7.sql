-- ============================================================
-- NotebookMind — Migration 7: teachers can delete their own courses
-- Run AFTER migrations 1-6. Idempotent.
--
-- courses had no DELETE policy, so a teacher deleting a course only removed it
-- from their local UI while the DB row (and its invite code) lived on. This
-- lets a teacher delete a course they own; enrollments/weeks cascade via their
-- ON DELETE CASCADE foreign keys.
-- ============================================================

DROP POLICY IF EXISTS "Teachers delete own courses" ON public.courses;
CREATE POLICY "Teachers delete own courses" ON public.courses
  FOR DELETE USING (auth.uid() = teacher_id);
