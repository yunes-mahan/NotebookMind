-- Migration 13 — course notebook content sync (teacher → student)
-- Store the full notebook (code cells + authored challenges) on the course so
-- enrolled students load and open real content from the DB, plus the week the
-- notebook belongs to. A unique (course_id, nb_key) lets the app upsert.
alter table public.course_notebooks
  add column if not exists content jsonb,
  add column if not exists week_number integer;
create unique index if not exists course_notebooks_course_nb_key
  on public.course_notebooks (course_id, nb_key);
