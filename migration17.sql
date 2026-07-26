-- Migration 17 — per-topic understanding for the teacher dashboard
-- Aggregates real notebook submissions by topic (notebook_title) so the teacher
-- sees, per topic, how much the class understood (first-try rate) vs. struggled.
-- Teacher-only (or the demo showcase), like the per-student RPC.
create or replace function public.get_course_topic_stats(p_course_id uuid)
returns table (
  topic text,
  students bigint,
  attempts bigint,
  first_try bigint,
  understood_pct integer
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(nullif(s.notebook_title, ''), 'Untitled') as topic,
    count(distinct s.user_id) as students,
    coalesce(sum(s.cells_attempted), 0) as attempts,
    coalesce(sum(s.cells_first_try), 0) as first_try,
    case when coalesce(sum(s.cells_attempted), 0) > 0
      then round(100.0 * sum(s.cells_first_try) / sum(s.cells_attempted))::int
      else 0 end as understood_pct
  from notebook_submissions s
  where s.course_id = p_course_id
    and (
      exists (select 1 from courses c where c.id = p_course_id and c.teacher_id = auth.uid())
      or p_course_id = '00000000-0000-0000-0000-000000000001'
    )
  group by coalesce(nullif(s.notebook_title, ''), 'Untitled')
  order by understood_pct asc;
$$;
grant execute on function public.get_course_topic_stats(uuid) to authenticated;
