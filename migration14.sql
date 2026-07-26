-- Migration 14 — allow the app to record cell attempts
-- cell_attempts is anonymous (no user_id); the previous policy allowed only the
-- service role to insert, so the client's recordCellAttempt() was rejected (403)
-- and the teacher's per-cell failure stats never populated. Let any signed-in
-- user record an (anonymous) attempt; reads stay teacher-only.
drop policy if exists "Service role only insert" on public.cell_attempts;
create policy "Authenticated insert attempts"
  on public.cell_attempts for insert
  to authenticated
  with check (true);
