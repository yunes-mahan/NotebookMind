-- ============================================================
-- NotebookMind — Migration 10: real Explain-mode comments
-- Run AFTER migrations 1-9. Idempotent.
--
-- Explain mode showed teacher notes + classmate comments from hardcoded demo
-- data (demoData.ts) and kept the student's own note in browser memory only.
-- This table makes them real: teacher notes and student comments per notebook
-- cell, scoped to a course and shared with its members.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cell_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  notebook_key text NOT NULL,
  cell_index integer NOT NULL,
  role text NOT NULL DEFAULT 'student',   -- 'teacher' | 'student'
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cell_comments_lookup
  ON public.cell_comments(course_id, notebook_key, cell_index, created_at);

ALTER TABLE public.cell_comments ENABLE ROW LEVEL SECURITY;

-- Read: your own comments always; course comments if you're enrolled or teach it.
DROP POLICY IF EXISTS "View course cell comments" ON public.cell_comments;
CREATE POLICY "View course cell comments" ON public.cell_comments
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      course_id IS NOT NULL
      AND (public.is_enrolled(course_id) OR public.is_course_teacher(course_id))
    )
  );

-- Write: you may only post as yourself. (role is set by the client from the
-- signed-in profile; a student cannot forge another user's comment.)
DROP POLICY IF EXISTS "Insert own cell comments" ON public.cell_comments;
CREATE POLICY "Insert own cell comments" ON public.cell_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Delete own cell comments" ON public.cell_comments;
CREATE POLICY "Delete own cell comments" ON public.cell_comments
  FOR DELETE USING (auth.uid() = user_id);
