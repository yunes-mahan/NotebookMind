-- ─── COURSE WEEKS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  theme text NOT NULL,
  topics jsonb NOT NULL DEFAULT '[]',
  slides_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  is_unlocked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, week_number)
);
ALTER TABLE public.course_weeks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Anyone enrolled or teacher reads weeks" ON public.course_weeks FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND (
      c.teacher_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.course_enrollments e WHERE e.course_id = c.id AND e.user_id = auth.uid())
    ))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Teachers manage weeks" ON public.course_weeks FOR ALL USING (
    EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND teacher_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── COURSE NOTEBOOKS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  week_id uuid REFERENCES public.course_weeks(id) ON DELETE CASCADE,
  nb_key text NOT NULL,
  title text NOT NULL,
  blurb text,
  status text NOT NULL DEFAULT 'locked',
  notebook_path text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.course_notebooks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Enrolled/teacher reads notebooks" ON public.course_notebooks FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND (
      c.teacher_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.course_enrollments e WHERE e.course_id = c.id AND e.user_id = auth.uid())
    ))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Teachers manage notebooks" ON public.course_notebooks FOR ALL USING (
    EXISTS (SELECT 1 FROM public.courses WHERE id = course_id AND teacher_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── DOCUMENTS: add course link columns ──────────────────────
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS is_course_material boolean NOT NULL DEFAULT false;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'paper';

DO $$ BEGIN
  CREATE POLICY "Enrolled students read course docs" ON public.documents FOR SELECT USING (
    is_course_material = false OR
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.course_enrollments WHERE course_id = documents.course_id AND user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.courses WHERE id = documents.course_id AND teacher_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── SEED: default course ─────────────────────────────────────
INSERT INTO public.courses (id, name, code, invite_code, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Data Science Fundamentals', 'DS101', 'DEMO2025', true)
ON CONFLICT DO NOTHING;
