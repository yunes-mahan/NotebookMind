-- ============================================================
-- NotebookMind — Migration 21: private per-cell notebook notes
-- Run AFTER migrations 1-20. Idempotent.
--
-- The Explain-mode margin "Note" stickies were session-only (in-memory) and
-- vanished on reload. This table persists them PER STUDENT, private and RLS-
-- scoped to the owner — a student's notes on a shared (teacher-uploaded) notebook
-- are saved to their own account, never seen by classmates or the teacher, and
-- survive reload / sync across their devices. Distinct from cell_comments, which
-- are the deliberately shared, course-scoped notes & comments.
--
-- One row per (user, notebook, cell); `notes` holds both margin sides:
--   { "L": ["…", "…"], "R": ["…"] }
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cell_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notebook_key text NOT NULL,
  cell_index integer NOT NULL,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notebook_key, cell_index)
);

CREATE INDEX IF NOT EXISTS idx_cell_notes_lookup
  ON public.cell_notes(user_id, notebook_key);

ALTER TABLE public.cell_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cell_notes TO authenticated;

-- Strictly private: a user only ever sees or writes their own notes.
DROP POLICY IF EXISTS "Users manage own cell notes" ON public.cell_notes;
CREATE POLICY "Users manage own cell notes" ON public.cell_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
