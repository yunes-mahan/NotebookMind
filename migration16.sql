-- Migration 16 — restore missing table privileges for the app role
-- notebook_challenges (AI-generation cache) and cell_comments (teacher notes +
-- student comments) had no DML grant for `authenticated`, so every write was a
-- 403 regardless of RLS: AI generations were never cached (regenerated every
-- open) and teacher notes never saved. RLS policies already scope these to the
-- owner, so granting the base privileges is safe.
grant select, insert, update, delete on public.notebook_challenges to authenticated;
grant select, insert, update, delete on public.cell_comments to authenticated;
