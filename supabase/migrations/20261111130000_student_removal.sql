-- Removing a student from a teacher's list.
-- A removed student is kept, not deleted: their lessons, payments and notes stay for
-- the teacher's records, and they can be brought back. They no longer count toward
-- the plan's student limit, and their upcoming lessons are cancelled.

alter table public.students
  add column removed_at     timestamptz,
  add column removal_reason text
    check (removal_reason in ('passed_test', 'stopped', 'other_teacher', 'other')),
  add column removal_note   text not null default '',
  add constraint students_removal_has_reason check ((removed_at is null) = (removal_reason is null));

-- ---------------------------------------------------------------------------
-- When a student is removed, cancel their lessons that haven't started yet.
-- Runs with the teacher's own permissions, so row-level security still applies.
-- ---------------------------------------------------------------------------

create or replace function private.cancel_lessons_of_removed_student()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.removed_at is not null and old.removed_at is null then
    update public.lessons
       set status = 'cancelled', awaiting = null
     where student_id = new.id
       and status <> 'cancelled'
       and starts_at > now();
  end if;
  return new;
end;
$$;

create trigger students_cancel_lessons_on_removal
  after update of removed_at on public.students
  for each row execute function private.cancel_lessons_of_removed_student();

-- ---------------------------------------------------------------------------
-- No new lessons for a removed student. Bring them back first.
-- ---------------------------------------------------------------------------

create or replace function private.lessons_need_active_student()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'cancelled' and exists (
    select 1 from public.students where id = new.student_id and removed_at is not null
  ) then
    raise exception 'This student was removed from the list'
      using errcode = 'HM004';
  end if;
  return new;
end;
$$;

create trigger lessons_need_active_student
  before insert or update of student_id, status on public.lessons
  for each row execute function private.lessons_need_active_student();

-- ---------------------------------------------------------------------------
-- The email lookup now also says if the student is on the teacher's former list,
-- so the app can offer to bring them back instead of adding them again.
-- The return type changes, so the function is dropped and created again.
-- ---------------------------------------------------------------------------

drop function public.find_student_account(text);

create function public.find_student_account(student_email text)
returns table (
  profile_id uuid,
  first_name text,
  last_name text,
  phone text,
  already_added boolean,
  removed_student_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.last_name, p.phone,
         s.id is not null and s.removed_at is null,
         case when s.removed_at is not null then s.id end
    from public.profiles p
    left join public.students s
      on s.profile_id = p.id
     and s.organization_id = private.current_org_id()
   where p.role = 'student'
     and lower(p.email) = lower(trim(student_email))
     and exists (
       select 1 from public.profiles me where me.id = auth.uid() and me.role = 'teacher'
     );
$$;

revoke execute on function public.find_student_account(text) from public, anon;
grant execute on function public.find_student_account(text) to authenticated;
