-- Migration 15 — per-student performance for the course teacher
-- Returns each enrolled student's real performance, but ONLY to the course's
-- teacher (or for the seeded demo course, which carries showcase fake students).
create or replace function public.get_course_student_performance(p_course_id uuid)
returns table (
  user_id uuid,
  display_name text,
  points integer,
  notebooks_completed bigint,
  cells_attempted bigint,
  cells_first_try bigint,
  last_active timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.user_id,
    coalesce(p.display_name, 'Student') as display_name,
    coalesce(p.points, 0) as points,
    count(distinct s.notebook_key) as notebooks_completed,
    coalesce(sum(s.cells_attempted), 0) as cells_attempted,
    coalesce(sum(s.cells_first_try), 0) as cells_first_try,
    max(s.completed_at) as last_active
  from course_enrollments e
  join profiles p on p.user_id = e.user_id
  left join notebook_submissions s
    on s.user_id = e.user_id and s.course_id = p_course_id
  where e.course_id = p_course_id
    and (
      exists (select 1 from courses c where c.id = p_course_id and c.teacher_id = auth.uid())
      or p_course_id = '00000000-0000-0000-0000-000000000001'
    )
  group by p.user_id, p.display_name, p.points
  order by p.points desc;
$$;
grant execute on function public.get_course_student_performance(uuid) to authenticated;
