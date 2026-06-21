-- ============================================================
-- NotebookMind + PaperMind — Combined Supabase Migration
-- Run this in the Supabase SQL editor for project wzooaiwmnsqvxxcoormp
-- ============================================================

-- updated_at helper (needed first)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ─── PROFILES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  display_name text,
  role text NOT NULL DEFAULT 'student', -- 'student' | 'teacher'
  persona text NOT NULL DEFAULT 'university',
  target_content_depth real NOT NULL DEFAULT 0.5,
  target_linguistic_complexity real NOT NULL DEFAULT 0.5,
  target_structural_cohesion real NOT NULL DEFAULT 0.5,
  points integer NOT NULL DEFAULT 0,
  weekly_points integer NOT NULL DEFAULT 0,
  weekly_reset_at timestamptz NOT NULL DEFAULT date_trunc('week', now()),
  username text UNIQUE,
  onboarding_done boolean NOT NULL DEFAULT false,
  elevenlabs_api_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles readable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT username_format
    CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,30}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── COURSES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code text UNIQUE DEFAULT SUBSTRING(MD5(RANDOM()::text), 1, 8),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers create courses" ON public.courses
  FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers update own courses" ON public.courses
  FOR UPDATE USING (auth.uid() = teacher_id);

-- ─── COURSE ENROLLMENTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);

ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own enrollments" ON public.course_enrollments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users enroll themselves" ON public.course_enrollments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Teachers view course enrollments" ON public.course_enrollments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND teacher_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON public.course_enrollments(user_id);

-- Deferred course SELECT policy (needs course_enrollments to exist first)
CREATE POLICY "Courses readable by enrolled or teacher" ON public.courses
  FOR SELECT USING (
    auth.uid() = teacher_id OR
    EXISTS (SELECT 1 FROM public.course_enrollments WHERE course_id = id AND user_id = auth.uid())
  );

-- ─── DOCUMENTS (papers, slides) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title text NOT NULL,
  source_text text,
  original_full_text text,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  persona text,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  sections_understood integer NOT NULL DEFAULT 0,
  total_sections integer NOT NULL DEFAULT 0,
  total_xp_earned integer NOT NULL DEFAULT 0,
  last_quiz_score integer,
  paper_url text,
  open_access_pdf text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own documents" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own documents" ON public.documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own documents" ON public.documents FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER documents_touch BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── SECTION NOTES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  section_index integer NOT NULL,
  section_title text,
  note_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, section_index)
);

ALTER TABLE public.section_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notes" ON public.section_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notes" ON public.section_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notes" ON public.section_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own notes" ON public.section_notes FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER section_notes_touch BEFORE UPDATE ON public.section_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_section_notes_doc ON public.section_notes(document_id);

-- ─── FLASHCARDS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  section_index integer NOT NULL,
  section_title text,
  front text NOT NULL,
  back text NOT NULL,
  context_sentence text,
  card_type text NOT NULL DEFAULT 'term_definition',
  review_state text NOT NULL DEFAULT 'new',
  due_at timestamptz NOT NULL DEFAULT now(),
  interval_days double precision NOT NULL DEFAULT 0,
  ease_factor double precision NOT NULL DEFAULT 2.5,
  repetitions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flashcards_user_due ON public.flashcards(user_id, due_at);
CREATE INDEX IF NOT EXISTS flashcards_document ON public.flashcards(document_id);

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own flashcards" ON public.flashcards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own flashcards" ON public.flashcards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own flashcards" ON public.flashcards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own flashcards" ON public.flashcards FOR DELETE USING (auth.uid() = user_id);

-- ─── QUIZ SESSIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents ON DELETE CASCADE,
  section_index integer,
  mode text NOT NULL DEFAULT 'section',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  report jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own quizzes" ON public.quiz_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own quizzes" ON public.quiz_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own quizzes" ON public.quiz_sessions FOR UPDATE USING (auth.uid() = user_id);

-- ─── NOTEBOOK SUBMISSIONS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notebook_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  notebook_key text NOT NULL,
  notebook_title text,
  xp_earned integer NOT NULL DEFAULT 0,
  cells_attempted integer NOT NULL DEFAULT 0,
  cells_first_try integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notebook_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own submissions" ON public.notebook_submissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own submissions" ON public.notebook_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Teachers view course submissions (anon agg only)" ON public.notebook_submissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND teacher_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_submissions_user ON public.notebook_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_course ON public.notebook_submissions(course_id);

-- ─── CELL ATTEMPTS (anonymous aggregate for teacher) ─────────
CREATE TABLE IF NOT EXISTS public.cell_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_key text NOT NULL,
  cell_index integer NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  succeeded boolean NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cell_attempts ENABLE ROW LEVEL SECURITY;

-- No user linkage — intentionally anonymous; teachers read aggregates
CREATE POLICY "Service role only insert" ON public.cell_attempts
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Teachers read cell attempts for their courses" ON public.cell_attempts
  FOR SELECT USING (
    course_id IS NULL OR
    EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND teacher_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_cell_attempts_notebook ON public.cell_attempts(notebook_key, cell_index);

-- ─── POINT EVENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.point_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  points integer NOT NULL,
  reason text NOT NULL,
  document_title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS point_events_user ON public.point_events(user_id, created_at DESC);

ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own point events" ON public.point_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Insert own point events" ON public.point_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── ATOMIC POINT INCREMENT ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_points(p_user_id uuid, p_points integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_week_start timestamptz := date_trunc('week', now());
BEGIN
  UPDATE public.profiles SET
    points = COALESCE(points, 0) + p_points,
    weekly_points = CASE
      WHEN COALESCE(weekly_reset_at, 'epoch'::timestamptz) < current_week_start THEN p_points
      ELSE COALESCE(weekly_points, 0) + p_points
    END,
    weekly_reset_at = CASE
      WHEN COALESCE(weekly_reset_at, 'epoch'::timestamptz) < current_week_start THEN current_week_start
      ELSE weekly_reset_at
    END
  WHERE user_id = p_user_id;
END; $$;

REVOKE ALL ON FUNCTION public.increment_points(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_points(uuid, integer) TO service_role;
