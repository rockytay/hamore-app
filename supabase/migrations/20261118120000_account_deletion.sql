-- Users delete their own account, and say why first.
--
-- Students give a reason (passed the practical test, or another reason they describe).
-- Teachers say whether they were satisfied; if not, they describe what went wrong, and
-- anyone can suggest improvements. Every answer is kept in
-- public.account_deletion_feedback for the Hamore team to review (and later for analysis
-- by an AI agent). The feedback holds no name, email or phone: only the role, the answers
-- and a few usage numbers, so it can be kept after the account is gone.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The feedback
-- ---------------------------------------------------------------------------

create table if not exists public.account_deletion_feedback (
  id                 uuid primary key default gen_random_uuid(),
  role               text not null check (role in ('teacher', 'student')),
  -- Students: why they leave.
  reason             text check (reason in ('passed_test', 'other')),
  -- Teachers: were they satisfied with the app.
  satisfied          boolean,
  -- The student's own reason, or what the teacher was unhappy with.
  details            text not null default '',
  -- What should be improved, if anything.
  improvements       text not null default '',
  -- Usage at the time, to put the feedback in context (counts only, nothing personal).
  stats              jsonb not null default '{}'::jsonb,
  account_created_at timestamptz,
  app_version        text not null default '',
  platform           text not null default '',
  created_at         timestamptz not null default now(),
  constraint deletion_feedback_student_reason
    check (role <> 'student' or reason is not null),
  constraint deletion_feedback_other_described
    check (reason is distinct from 'other' or length(trim(details)) > 0),
  constraint deletion_feedback_teacher_answered
    check (role <> 'teacher' or satisfied is not null),
  constraint deletion_feedback_unhappy_described
    check (satisfied is distinct from false or length(trim(details)) > 0)
);

create index if not exists account_deletion_feedback_created_at_idx
  on public.account_deletion_feedback (created_at desc);

-- No policies: app users can't read or write it directly. The Hamore team reads it in the
-- Supabase dashboard (Table Editor or SQL), which bypasses row-level security.
alter table public.account_deletion_feedback enable row level security;
revoke all on public.account_deletion_feedback from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Deleting the signed-in user's account
-- ---------------------------------------------------------------------------
--
-- Student: their place on the teacher's list is closed as a removal ("passed the test" or
-- "stopped"), so the teacher keeps the lesson and payment history and upcoming lessons are
-- cancelled. Their own details (addresses, contacts...) are deleted with the account.
--
-- Teacher: their organization is deleted with everything in it: students on the list,
-- lessons, payments, notes, tests and open time. The students' own accounts stay; they
-- simply have no teacher any more. (A school with other teachers is kept.)

create or replace function public.delete_my_account(
  p_reason       text,
  p_satisfied    boolean,
  p_details      text,
  p_improvements text,
  p_app_version  text default '',
  p_platform     text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles;
  v_stats   jsonb;
  v_details text := trim(coalesce(p_details, ''));
begin
  select * into v_profile from public.profiles where id = v_uid;
  if v_uid is null or not found then
    raise exception 'Not signed in' using errcode = 'HM020';
  end if;

  -- Check the answers here too, so a bad request gets a clear error code.
  if v_profile.role = 'student' and (
       p_reason is null or p_reason not in ('passed_test', 'other')
       or (p_reason = 'other' and v_details = '')) then
    raise exception 'A reason is required' using errcode = 'HM021';
  end if;
  if v_profile.role = 'teacher' and (p_satisfied is null or (not p_satisfied and v_details = '')) then
    raise exception 'Feedback is required' using errcode = 'HM021';
  end if;

  if v_profile.role = 'teacher' then
    select jsonb_build_object(
             'active_students', (select count(*) from public.students s
                                  where s.organization_id = v_profile.organization_id and s.removed_at is null),
             'all_students',    (select count(*) from public.students s
                                  where s.organization_id = v_profile.organization_id),
             'lessons_taken',   (select count(*) from public.lessons l
                                  where l.organization_id = v_profile.organization_id
                                    and l.status = 'booked' and l.ends_at <= now()),
             'payments',        (select count(*) from public.payments p
                                  where p.organization_id = v_profile.organization_id),
             'plan',            (select o.plan_id from public.organizations o
                                  where o.id = v_profile.organization_id),
             'days_since_sign_up', (now()::date - v_profile.created_at::date))
      into v_stats;
  else
    select jsonb_build_object(
             'had_teacher',     exists (select 1 from public.students s
                                         where s.profile_id = v_uid and s.removed_at is null),
             'lessons_taken',   (select count(*) from public.lessons l
                                  join public.students s on s.id = l.student_id
                                 where s.profile_id = v_uid and l.status = 'booked' and l.ends_at <= now()),
             'passed_practical', exists (select 1 from public.student_tests t
                                          join public.students s on s.id = t.student_id
                                         where s.profile_id = v_uid and t.kind = 'practical'
                                           and t.result = 'passed'),
             'days_since_sign_up', (now()::date - v_profile.created_at::date))
      into v_stats;
  end if;

  insert into public.account_deletion_feedback
    (role, reason, satisfied, details, improvements, stats, account_created_at, app_version, platform)
  values
    (v_profile.role,
     case when v_profile.role = 'student' then p_reason end,
     case when v_profile.role = 'teacher' then p_satisfied end,
     v_details,
     trim(coalesce(p_improvements, '')),
     v_stats,
     v_profile.created_at,
     left(coalesce(p_app_version, ''), 40),
     left(coalesce(p_platform, ''), 40));

  if v_profile.role = 'student' then
    -- Cancels their upcoming lessons (trigger on removed_at); history stays with the teacher.
    update public.students
       set removed_at = now(),
           removal_reason = case when p_reason = 'passed_test' then 'passed_test' else 'stopped' end,
           removal_note = 'התלמיד/ה מחק/ה את החשבון'
     where profile_id = v_uid and removed_at is null;
  elsif v_profile.organization_id is not null and not exists (
    select 1 from public.profiles other
     where other.organization_id = v_profile.organization_id
       and other.role = 'teacher'
       and other.id <> v_uid
  ) then
    delete from public.organizations where id = v_profile.organization_id;
  end if;

  -- The profile goes with the login (on delete cascade); students.profile_id becomes null.
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account(text, boolean, text, text, text, text) from public, anon;
grant execute on function public.delete_my_account(text, boolean, text, text, text, text) to authenticated;
