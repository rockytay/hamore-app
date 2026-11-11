-- Students must have their own Hamore account.
-- A teacher can only add someone who already signed up as a student, found by
-- their email. One person is then one account everywhere, instead of a typed-in
-- copy per teacher that can drift from the real student.
--
-- The link is students.profile_id. The student's profile.organization_id is left
-- alone on purpose: the row-level security policies treat anyone whose profile
-- points at an organization as a member of it, and a student must never see the
-- teacher's other students or payments.

-- The same student account can be added only once per teacher.
alter table public.students
  add constraint students_one_per_account unique (organization_id, profile_id);

create index students_profile_id_idx on public.students (profile_id);

-- ---------------------------------------------------------------------------
-- Every new student row must point at a student account. The name and phone
-- come from that account, so the teacher can't attach a different person.
-- profile_id stays nullable so the teacher keeps the lesson and payment history
-- if the student later deletes their account (the foreign key sets it to null).
-- ---------------------------------------------------------------------------

create or replace function private.link_student_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.profiles;
begin
  if tg_op = 'UPDATE' then
    if new.profile_id is not null and new.profile_id is distinct from old.profile_id then
      raise exception 'A student''s account cannot be changed'
        using errcode = 'HM003';
    end if;
    return new;
  end if;

  if new.profile_id is null then
    raise exception 'A student can only be added from an existing student account'
      using errcode = 'HM001';
  end if;

  select * into account from public.profiles where id = new.profile_id;
  if not found or account.role <> 'student' then
    raise exception 'This account is not a student account'
      using errcode = 'HM002';
  end if;

  new.first_name := account.first_name;
  new.last_name  := account.last_name;
  new.phone      := account.phone;
  return new;
end;
$$;

create trigger students_link_account
  before insert or update of profile_id on public.students
  for each row execute function private.link_student_account();

-- ---------------------------------------------------------------------------
-- Lets a teacher find a student account by its exact email before adding it.
-- Profiles are otherwise private, so this returns only the name and phone (for
-- the teacher to confirm it is the right person), and only to teachers.
-- already_added says the student is already on this teacher's list.
-- ---------------------------------------------------------------------------

create or replace function public.find_student_account(student_email text)
returns table (profile_id uuid, first_name text, last_name text, phone text, already_added boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.last_name, p.phone,
         exists (
           select 1 from public.students s
            where s.profile_id = p.id
              and s.organization_id = private.current_org_id()
         )
    from public.profiles p
   where p.role = 'student'
     and lower(p.email) = lower(trim(student_email))
     and exists (
       select 1 from public.profiles me where me.id = auth.uid() and me.role = 'teacher'
     );
$$;

revoke execute on function public.find_student_account(text) from public, anon;
grant execute on function public.find_student_account(text) to authenticated;
