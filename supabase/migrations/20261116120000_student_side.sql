-- The student side of the app.
-- A student sees their own lessons, payments, balance and the lesson notes their teacher
-- chose to share, requests lessons in the teacher's open time, and approves or declines
-- lessons the teacher scheduled.
--
-- Students only ever READ tables directly. Every change a student makes goes through the
-- functions at the bottom, which check the rules; the table policies give students no
-- insert, update or delete.
--
-- A student has one teacher at a time: one active row in public.students per account.

-- ---------------------------------------------------------------------------
-- One teacher at a time
-- ---------------------------------------------------------------------------

create or replace function private.student_has_one_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null and new.removed_at is null and exists (
    select 1 from public.students s
     where s.profile_id = new.profile_id
       and s.removed_at is null
       and s.id <> new.id
       and s.organization_id <> new.organization_id
  ) then
    raise exception 'This student already has a teacher'
      using errcode = 'HM005';
  end if;
  return new;
end;
$$;

-- Adding a student, and bringing a former student back, both make the row active.
create trigger students_one_teacher
  before insert or update of profile_id, removed_at on public.students
  for each row execute function private.student_has_one_teacher();

-- Backstop for two teachers adding the same student at the same moment.
create unique index students_one_active_teacher
  on public.students (profile_id)
  where profile_id is not null and removed_at is null;

-- ---------------------------------------------------------------------------
-- Lesson notes the teacher shares with the student. Private by default.
-- ---------------------------------------------------------------------------

alter table public.lesson_notes
  add column shared_with_student boolean not null default false;

-- ---------------------------------------------------------------------------
-- Who the signed-in student is. Security definer so policies can use them
-- without recursing into the students policies.
-- ---------------------------------------------------------------------------

-- The signed-in student's row on their teacher's list, or null.
create or replace function private.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.students
   where profile_id = auth.uid() and removed_at is null
   limit 1;
$$;

-- The organization of the signed-in student's teacher, or null.
create or replace function private.my_teacher_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.students
   where profile_id = auth.uid() and removed_at is null
   limit 1;
$$;

revoke execute on function private.my_student_id(), private.my_teacher_org_id() from public;
grant execute on function private.my_student_id(), private.my_teacher_org_id() to authenticated;

-- ---------------------------------------------------------------------------
-- What a student can read. These add to the teacher policies; a student has no
-- organization of their own, so the teacher policies never match them.
-- ---------------------------------------------------------------------------

create policy "Students read their own student record"
  on public.students for select to authenticated
  using (profile_id = (select auth.uid()) and removed_at is null);

create policy "Students read their own lessons"
  on public.lessons for select to authenticated
  using (student_id = (select private.my_student_id()));

create policy "Students read their own payments"
  on public.payments for select to authenticated
  using (student_id = (select private.my_student_id()));

create policy "Students read notes shared with them"
  on public.lesson_notes for select to authenticated
  using (shared_with_student and student_id = (select private.my_student_id()));

create policy "Students read their teacher's open time"
  on public.availability_slots for select to authenticated
  using (organization_id = (select private.my_teacher_org_id()));

create policy "Students read their teacher's lesson types"
  on public.lesson_types for select to authenticated
  using (organization_id = (select private.my_teacher_org_id()));

-- ---------------------------------------------------------------------------
-- The student's teacher: name, contact details and prices only.
-- ---------------------------------------------------------------------------

create function public.my_teacher()
returns table (
  first_name          text,
  last_name           text,
  phone               text,
  email               text,
  city                text,
  car_model           text,
  transmission        text,
  lesson_price        integer,
  lesson_duration_min integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.first_name, p.last_name, p.phone, p.email, p.city, p.car_model, p.transmission,
         p.lesson_price, p.lesson_duration_min
    from public.profiles p
   where p.role = 'teacher'
     and p.organization_id = private.my_teacher_org_id()
   order by p.created_at
   limit 1;
$$;

-- When the teacher is busy, so the student only sees free times. Times only, no names.
create function public.teacher_busy_times(range_start timestamptz, range_end timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.starts_at, l.ends_at
    from public.lessons l
   where l.organization_id = private.my_teacher_org_id()
     and l.status <> 'cancelled'
     and l.starts_at < range_end
     and l.ends_at > range_start;
$$;

-- ---------------------------------------------------------------------------
-- What a student can do
-- ---------------------------------------------------------------------------

-- Pending requests a student can have waiting for the teacher at once.
create function private.max_open_requests()
returns integer
language sql
immutable
as $$ select 3 $$;

-- The student asks for a lesson in the teacher's open time. The teacher then approves it.
create function public.request_lesson(requested_type_id uuid, requested_start timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.my_student_id();
  v_org     uuid := private.my_teacher_org_id();
  v_type    public.lesson_types;
  v_teacher public.profiles;
  v_end     timestamptz;
  v_price   integer;
  v_id      uuid;
begin
  if v_student is null or v_org is null then
    raise exception 'You are not on a teacher''s list' using errcode = 'HM010';
  end if;

  select * into v_type from public.lesson_types t
   where t.id = requested_type_id and t.organization_id = v_org and t.is_active;
  if not found then
    raise exception 'Unknown lesson type' using errcode = 'HM011';
  end if;

  if requested_start <= now() then
    raise exception 'The lesson must be in the future' using errcode = 'HM012';
  end if;

  v_end := requested_start + make_interval(mins => v_type.duration_min);

  if not exists (
    select 1 from public.availability_slots s
     where s.organization_id = v_org
       and s.starts_at <= requested_start
       and s.ends_at >= v_end
  ) then
    raise exception 'The lesson is outside the teacher''s open time' using errcode = 'HM013';
  end if;

  if (select count(*) from public.lessons l
       where l.student_id = v_student
         and l.status = 'pending' and l.awaiting = 'teacher'
         and l.starts_at > now()) >= private.max_open_requests() then
    raise exception 'Too many requests are waiting for the teacher' using errcode = 'HM014';
  end if;

  -- Same price rule as private.set_lesson_price, but with the teacher's prices:
  -- that trigger reads the signed-in user's profile, which here is the student.
  select * into v_teacher from public.profiles p
   where p.organization_id = v_org and p.role = 'teacher'
   order by p.created_at
   limit 1;
  v_price := coalesce(
    v_type.price,
    v_teacher.lesson_price
      * greatest(1, round(v_type.duration_min::numeric / nullif(v_teacher.lesson_duration_min, 0)))::integer,
    0);

  -- Overlapping another lesson fails with the lessons_no_overlap constraint (23P01).
  insert into public.lessons (organization_id, student_id, lesson_type_id, starts_at, ends_at,
                              status, awaiting, price)
  values (v_org, v_student, v_type.id, requested_start, v_end, 'pending', 'teacher', v_price)
  returning id into v_id;

  return v_id;
end;
$$;

-- The student approves or declines a lesson the teacher scheduled for them.
create function public.respond_to_lesson(target_lesson_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lessons l
     set status = case when accept then 'booked' else 'cancelled' end,
         awaiting = null
   where l.id = target_lesson_id
     and l.student_id = private.my_student_id()
     and l.status = 'pending'
     and l.awaiting = 'student'
     and l.starts_at > now();
  if not found then
    raise exception 'This lesson is not waiting for your approval' using errcode = 'HM015';
  end if;
end;
$$;

-- The student withdraws a request the teacher hasn't answered yet.
create function public.cancel_lesson_request(target_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lessons l
     set status = 'cancelled', awaiting = null
   where l.id = target_lesson_id
     and l.student_id = private.my_student_id()
     and l.status = 'pending'
     and l.awaiting = 'teacher';
  if not found then
    raise exception 'This request can no longer be withdrawn' using errcode = 'HM016';
  end if;
end;
$$;

revoke execute on function
  public.my_teacher(),
  public.teacher_busy_times(timestamptz, timestamptz),
  public.request_lesson(uuid, timestamptz),
  public.respond_to_lesson(uuid, boolean),
  public.cancel_lesson_request(uuid)
  from public, anon;

grant execute on function
  public.my_teacher(),
  public.teacher_busy_times(timestamptz, timestamptz),
  public.request_lesson(uuid, timestamptz),
  public.respond_to_lesson(uuid, boolean),
  public.cancel_lesson_request(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The teacher's email lookup also says when the student already has another teacher.
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
  removed_student_id uuid,
  has_other_teacher boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.last_name, p.phone,
         s.id is not null and s.removed_at is null,
         case when s.removed_at is not null then s.id end,
         exists (
           select 1 from public.students other
            where other.profile_id = p.id
              and other.removed_at is null
              and other.organization_id <> private.current_org_id()
         )
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
