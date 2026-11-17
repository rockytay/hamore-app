-- Safe to run more than once (e.g. after a failed attempt in the SQL editor).
--
-- The student file ("כרטיס תלמיד"): everything a driving teacher keeps about a student,
-- from the research in November 2026.
--
-- Who owns what:
--   * The student's own details live on their account and travel with them between
--     teachers: birth date, language, reminder preferences, privacy consent, pickup
--     addresses, parent and emergency contacts, and weekly availability. The student
--     fills them in; their current teacher can read and correct them.
--   * The teacher's file lives on the teacher's student row (public.students) and in tables
--     next to it: licence file (green form, eye test, health declaration, theory), status,
--     money arrangements, per-student prices, tests and the progress on the driving tasks.
--     The student reads it; only the teacher changes it.
--
-- Not stored on purpose: medical details (only yes/no flags), documents and photos (need
-- file storage; a later phase), and the ID number stays where it was (column encryption
-- is a later phase; the app shows it masked).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A date from sign-up metadata, or null when it is missing or not a real date.
create or replace function private.try_date(value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return value::date;
exception when others then
  return null;
end;
$$;

-- The account belongs to a student on the signed-in teacher's list, current or former.
create or replace function private.is_my_student_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
     where s.profile_id = target
       and s.organization_id = private.current_org_id()
  );
$$;

-- The same, but only a current student: former students' details are read-only.
create or replace function private.is_my_active_student_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
     where s.profile_id = target
       and s.organization_id = private.current_org_id()
       and s.removed_at is null
  );
$$;

revoke execute on function
  private.is_my_student_profile(uuid),
  private.is_my_active_student_profile(uuid)
  from public;
grant execute on function
  private.is_my_student_profile(uuid),
  private.is_my_active_student_profile(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The student's own details, on their account
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- Not in the future is checked by the app and at sign-up: a check constraint can't use today's date.
  add column if not exists birth_date            date check (birth_date >= date '1900-01-01'),
  add column if not exists preferred_language    text not null default 'he'
    check (preferred_language in ('he', 'ar', 'ru', 'en')),
  add column if not exists reminder_channel      text not null default 'push'
    check (reminder_channel in ('push', 'sms', 'whatsapp')),
  add column if not exists reminder_hours_before integer not null default 24
    check (reminder_hours_before between 1 and 168),
  -- When the student agreed to their details being kept (privacy law). Set at sign-up.
  add column if not exists privacy_consent_at    timestamptz,
  add column if not exists marketing_consent     boolean not null default false,
  -- Teacher settings: how long a green form and a passed theory test stay valid.
  -- Used for the expiry alerts; editable because the rules change.
  add column if not exists green_form_valid_years integer not null default 3
    check (green_form_valid_years between 1 and 20),
  add column if not exists theory_valid_years     integer not null default 5
    check (theory_valid_years between 1 and 20);

grant update (
  birth_date, preferred_language, reminder_channel, reminder_hours_before,
  privacy_consent_at, marketing_consent, green_form_valid_years, theory_valid_years
) on public.profiles to authenticated;

-- A teacher reads the accounts of their students (birth date, language, email...).
-- Changing them stays with the student.
drop policy if exists "Teachers read their students' accounts" on public.profiles;
create policy "Teachers read their students' accounts"
  on public.profiles for select to authenticated
  using ((select private.is_my_student_profile(id)));

-- Sign-up also saves the student's birth date, language and consent.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r      text  := coalesce(meta ->> 'role', 'teacher');
  first  text  := coalesce(meta ->> 'first_name', '');
  last   text  := coalesce(meta ->> 'last_name', '');
  lang   text  := coalesce(meta ->> 'preferred_language', 'he');
  born   date  := private.try_date(meta ->> 'birth_date');
  org_id uuid;
begin
  if r not in ('teacher', 'student') then
    r := 'teacher';
  end if;
  if lang not in ('he', 'ar', 'ru', 'en') then
    lang := 'he';
  end if;
  if born is not null and (born > current_date or born < date '1900-01-01') then
    born := null;
  end if;

  if r = 'teacher' then
    insert into public.organizations (name)
    values (coalesce(nullif(trim(first || ' ' || last), ''), new.email, 'מורה'))
    returning id into org_id;

    insert into public.lesson_types (organization_id, name, duration_min, sort_order) values
      (org_id, 'שיעור רגיל', 40, 1),
      (org_id, 'שיעור כפול', 80, 2),
      (org_id, 'טסט פנימי', 40, 3),
      (org_id, 'טסט', 40, 4);
  end if;

  insert into public.profiles (id, role, organization_id, first_name, last_name, phone, email,
                               driver_license_number, teacher_license_number,
                               birth_date, preferred_language, privacy_consent_at, marketing_consent)
  values (new.id, r, org_id, first, last, coalesce(meta ->> 'phone', ''), coalesce(new.email, ''),
          coalesce(meta ->> 'driver_license_number', ''), coalesce(meta ->> 'teacher_license_number', ''),
          born, lang,
          case when (meta ->> 'privacy_consent') = 'true' then now() end,
          coalesce((meta ->> 'marketing_consent') = 'true', false));

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pickup addresses, contacts and weekly availability: the student's, on their account
-- ---------------------------------------------------------------------------

create table if not exists public.student_addresses (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  -- e.g. "בית", "בית ספר", "עבודה"
  label        text not null default '',
  street       text not null check (length(trim(street)) > 0),
  house_number text not null default '',
  city         text not null check (length(trim(city)) > 0),
  -- For navigation. Empty until geocoding is added; the app navigates by the address text.
  latitude     double precision check (latitude between -90 and 90),
  longitude    double precision check (longitude between -180 and 180),
  -- e.g. "ליד השער האחורי"
  pickup_notes text not null default '',
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists student_addresses_profile_id_idx on public.student_addresses (profile_id);
-- One default pickup address per student.
create unique index if not exists student_addresses_one_default
  on public.student_addresses (profile_id) where is_default;

drop trigger if exists student_addresses_updated_at on public.student_addresses;
create trigger student_addresses_updated_at
  before update on public.student_addresses
  for each row execute function private.set_updated_at();

create table if not exists public.student_contacts (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- parent: required for students under 18. emergency: anyone to call if something happens.
  kind       text not null check (kind in ('parent', 'emergency')),
  name       text not null check (length(trim(name)) > 0),
  phone      text not null check (length(trim(phone)) > 0),
  -- e.g. "אמא", "אבא", "בן/בת זוג"
  relation   text not null default '',
  -- This contact pays for the lessons and gets the payment reminders.
  is_payer   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_contacts_profile_id_idx on public.student_contacts (profile_id);

drop trigger if exists student_contacts_updated_at on public.student_contacts;
create trigger student_contacts_updated_at
  before update on public.student_contacts
  for each row execute function private.set_updated_at();

-- When the student can usually take lessons, e.g. Sunday 16:00–19:00. Local time.
create table if not exists public.student_availability (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- 0 = Sunday … 6 = Saturday, like JavaScript's Date.getDay().
  weekday    smallint not null check (weekday between 0 and 6),
  -- Minutes from midnight.
  start_min  integer not null check (start_min between 0 and 1439),
  end_min    integer not null check (end_min between 1 and 1440),
  created_at timestamptz not null default now(),
  check (end_min > start_min)
);

create index if not exists student_availability_profile_id_idx on public.student_availability (profile_id, weekday);

alter table public.student_addresses    enable row level security;
alter table public.student_contacts     enable row level security;
alter table public.student_availability enable row level security;

drop policy if exists "Students manage their own addresses" on public.student_addresses;
create policy "Students manage their own addresses"
  on public.student_addresses for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
drop policy if exists "Teachers read their students' addresses" on public.student_addresses;
create policy "Teachers read their students' addresses"
  on public.student_addresses for select to authenticated
  using ((select private.is_my_student_profile(profile_id)));
drop policy if exists "Teachers manage their current students' addresses" on public.student_addresses;
create policy "Teachers manage their current students' addresses"
  on public.student_addresses for all to authenticated
  using ((select private.is_my_active_student_profile(profile_id)))
  with check ((select private.is_my_active_student_profile(profile_id)));

drop policy if exists "Students manage their own contacts" on public.student_contacts;
create policy "Students manage their own contacts"
  on public.student_contacts for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
drop policy if exists "Teachers read their students' contacts" on public.student_contacts;
create policy "Teachers read their students' contacts"
  on public.student_contacts for select to authenticated
  using ((select private.is_my_student_profile(profile_id)));
drop policy if exists "Teachers manage their current students' contacts" on public.student_contacts;
create policy "Teachers manage their current students' contacts"
  on public.student_contacts for all to authenticated
  using ((select private.is_my_active_student_profile(profile_id)))
  with check ((select private.is_my_active_student_profile(profile_id)));

drop policy if exists "Students manage their own availability" on public.student_availability;
create policy "Students manage their own availability"
  on public.student_availability for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
drop policy if exists "Teachers read their students' availability" on public.student_availability;
create policy "Teachers read their students' availability"
  on public.student_availability for select to authenticated
  using ((select private.is_my_student_profile(profile_id)));
drop policy if exists "Teachers manage their current students' availability" on public.student_availability;
create policy "Teachers manage their current students' availability"
  on public.student_availability for all to authenticated
  using ((select private.is_my_active_student_profile(profile_id)))
  with check ((select private.is_my_active_student_profile(profile_id)));

-- ---------------------------------------------------------------------------
-- The teacher's file on the student
-- ---------------------------------------------------------------------------

alter table public.students
  -- Frozen: still on the list, but on a break. Left / got the licence is the removal
  -- (removed_at + removal_reason), so the history stays.
  add column if not exists status                    text not null default 'active'
    check (status in ('active', 'frozen')),
  -- Green form ("טופס ירוק"): the date it was issued. Null means the student doesn't have one yet.
  add column if not exists green_form_issued_at      date,
  add column if not exists eye_test_done             boolean not null default false,
  -- A licence restriction: must drive with glasses or contact lenses.
  add column if not exists needs_glasses             boolean not null default false,
  -- Yes/no only. Medical details are never stored.
  add column if not exists health_declaration_done   boolean not null default false,
  add column if not exists theory_passed_at          date,
  add column if not exists prior_license             text not null default 'none'
    check (prior_license in ('none', 'add_category', 'conversion', 'foreign', 'renewal')),
  -- The teacher's own rating, 1–5. Not shown in the student app.
  add column if not exists test_readiness            smallint check (test_readiness between 1 and 5),
  add column if not exists payment_plan              text not null default 'per_lesson'
    check (payment_plan in ('per_lesson', 'package', 'contract', 'deposit')),
  -- e.g. "חבילה של 10 שיעורים ב־1,400 ₪"
  add column if not exists payment_plan_note         text not null default '',
  add column if not exists preferred_payment_method  text
    check (preferred_payment_method in ('cash', 'bit', 'paybox', 'bank_transfer', 'credit_card', 'check')),
  add column if not exists payer                     text not null default 'student'
    check (payer in ('student', 'parent')),
  -- How long before a lesson the student may cancel without paying.
  add column if not exists cancellation_notice_hours integer not null default 24
    check (cancellation_notice_hours between 0 and 168),
  add column if not exists referral_source           text
    check (referral_source in ('recommendation', 'instagram', 'facebook', 'google', 'other'));

alter table public.students drop constraint if exists students_theory_date_needs_pass;
alter table public.students
  add constraint students_theory_date_needs_pass check (theory_passed_at is null or theory_passed);

-- ---------------------------------------------------------------------------
-- Per-student prices: override the lesson type's price for one student.
-- ---------------------------------------------------------------------------

create table if not exists public.student_prices (
  student_id      uuid not null,
  lesson_type_id  uuid not null,
  organization_id uuid not null default private.current_org_id(),
  -- In shekels.
  price           integer not null check (price >= 0),
  updated_at      timestamptz not null default now(),
  primary key (student_id, lesson_type_id),
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete cascade,
  foreign key (lesson_type_id, organization_id)
    references public.lesson_types (id, organization_id) on delete cascade
);

drop trigger if exists student_prices_updated_at on public.student_prices;
create trigger student_prices_updated_at
  before update on public.student_prices
  for each row execute function private.set_updated_at();

-- The price of a lesson: the student's own price for that type, else the type's price,
-- else the teacher's lesson price times how many standard lessons fit in it (double = 2x).
create or replace function private.lesson_price(target_student uuid, target_type uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           sp.price,
           lt.price,
           t.lesson_price
             * greatest(1, round(lt.duration_min::numeric / nullif(t.lesson_duration_min, 0)))::integer,
           0)
    from public.lesson_types lt
    left join public.student_prices sp
      on sp.student_id = target_student and sp.lesson_type_id = lt.id
    left join lateral (
      select p.lesson_price, p.lesson_duration_min
        from public.profiles p
       where p.organization_id = lt.organization_id and p.role = 'teacher'
       order by p.created_at
       limit 1
    ) t on true
   where lt.id = target_type;
$$;

revoke execute on function private.lesson_price(uuid, uuid) from public;
grant execute on function private.lesson_price(uuid, uuid) to authenticated;

-- Lessons the teacher schedules now use the student's own price too.
create or replace function private.set_lesson_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price is null then
    new.price := coalesce(private.lesson_price(new.student_id, new.lesson_type_id), 0);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Special lessons: night, highway / intercity, rain.
-- ---------------------------------------------------------------------------

alter table public.lessons
  add column if not exists special_kind text check (special_kind in ('night', 'highway', 'rain'));

-- ---------------------------------------------------------------------------
-- Tests: internal and practical (the real test at the licensing office).
-- ---------------------------------------------------------------------------

create table if not exists public.student_tests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  student_id      uuid not null,
  kind            text not null check (kind in ('internal', 'practical')),
  scheduled_at    timestamptz not null,
  -- Testing ground or meeting point.
  location        text not null default '',
  -- 1 for the first try, 2 for the second...
  attempt         smallint not null default 1 check (attempt >= 1),
  result          text not null default 'scheduled'
    check (result in ('scheduled', 'passed', 'failed', 'cancelled')),
  -- The licensing office test fee, and its receipt number.
  fee_paid        boolean not null default false,
  fee_reference   text not null default '',
  -- What the teacher charges for providing the car on test day, in shekels.
  vehicle_fee     integer check (vehicle_fee >= 0),
  -- From the examiner's form, when failed.
  failure_reasons text not null default '',
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete cascade
);

create index if not exists student_tests_student_id_idx on public.student_tests (student_id, scheduled_at desc);

drop trigger if exists student_tests_updated_at on public.student_tests;
create trigger student_tests_updated_at
  before update on public.student_tests
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Driving tasks ("כרטיס תלמיד"): the official tasks in 4 stages, and each student's
-- progress on them. The list itself is added by a later migration once we have the
-- official wording; until then the app says it is empty.
-- ---------------------------------------------------------------------------

create table if not exists public.driving_tasks (
  id         smallint primary key,
  stage      smallint not null check (stage between 1 and 4),
  sort_order smallint not null,
  title      text not null check (length(trim(title)) > 0),
  unique (stage, sort_order)
);

-- No row = not practised yet.
create table if not exists public.student_task_progress (
  student_id      uuid not null,
  task_id         smallint not null references public.driving_tasks (id),
  organization_id uuid not null default private.current_org_id(),
  status          text not null check (status in ('practicing', 'mastered')),
  updated_at      timestamptz not null default now(),
  primary key (student_id, task_id),
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete cascade
);

drop trigger if exists student_task_progress_updated_at on public.student_task_progress;
create trigger student_task_progress_updated_at
  before update on public.student_task_progress
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security for the teacher's file
-- ---------------------------------------------------------------------------

alter table public.student_prices        enable row level security;
alter table public.student_tests         enable row level security;
alter table public.driving_tasks         enable row level security;
alter table public.student_task_progress enable row level security;

drop policy if exists "Organization manages its student prices" on public.student_prices;
create policy "Organization manages its student prices"
  on public.student_prices for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));
drop policy if exists "Students read their own prices" on public.student_prices;
create policy "Students read their own prices"
  on public.student_prices for select to authenticated
  using (student_id = (select private.my_student_id()));

drop policy if exists "Organization manages its student tests" on public.student_tests;
create policy "Organization manages its student tests"
  on public.student_tests for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));
drop policy if exists "Students read their own tests" on public.student_tests;
create policy "Students read their own tests"
  on public.student_tests for select to authenticated
  using (student_id = (select private.my_student_id()));

drop policy if exists "Everyone signed in reads the driving tasks" on public.driving_tasks;
create policy "Everyone signed in reads the driving tasks"
  on public.driving_tasks for select to authenticated
  using (true);

drop policy if exists "Organization manages its students' task progress" on public.student_task_progress;
create policy "Organization manages its students' task progress"
  on public.student_task_progress for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));
drop policy if exists "Students read their own task progress" on public.student_task_progress;
create policy "Students read their own task progress"
  on public.student_task_progress for select to authenticated
  using (student_id = (select private.my_student_id()));

-- ---------------------------------------------------------------------------
-- Student functions that change
-- ---------------------------------------------------------------------------

-- The teacher's details for the student now include the validity settings, for the
-- expiry reminders. The return type changes, so the function is dropped and created again.
drop function if exists public.my_teacher();

create function public.my_teacher()
returns table (
  first_name             text,
  last_name              text,
  phone                  text,
  email                  text,
  city                   text,
  car_model              text,
  transmission           text,
  lesson_price           integer,
  lesson_duration_min    integer,
  green_form_valid_years integer,
  theory_valid_years     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.first_name, p.last_name, p.phone, p.email, p.city, p.car_model, p.transmission,
         p.lesson_price, p.lesson_duration_min, p.green_form_valid_years, p.theory_valid_years
    from public.profiles p
   where p.role = 'teacher'
     and p.organization_id = private.my_teacher_org_id()
   order by p.created_at
   limit 1;
$$;

revoke execute on function public.my_teacher() from public, anon;
grant execute on function public.my_teacher() to authenticated;

-- Lesson requests: a frozen student can't request (HM017), and the student's own price applies.
create or replace function public.request_lesson(requested_type_id uuid, requested_start timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.my_student_id();
  v_org     uuid := private.my_teacher_org_id();
  v_type    public.lesson_types;
  v_end     timestamptz;
  v_id      uuid;
begin
  if v_student is null or v_org is null then
    raise exception 'You are not on a teacher''s list' using errcode = 'HM010';
  end if;

  if exists (select 1 from public.students s where s.id = v_student and s.status = 'frozen') then
    raise exception 'Your lessons are paused' using errcode = 'HM017';
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

  -- Overlapping another lesson fails with the lessons_no_overlap constraint (23P01).
  insert into public.lessons (organization_id, student_id, lesson_type_id, starts_at, ends_at,
                              status, awaiting, price)
  values (v_org, v_student, v_type.id, requested_start, v_end, 'pending', 'teacher',
          coalesce(private.lesson_price(v_student, v_type.id), 0))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on
  public.student_addresses, public.student_contacts, public.student_availability,
  public.student_prices, public.student_tests, public.driving_tasks, public.student_task_progress
  from anon;

grant select, insert, update, delete on
  public.student_addresses, public.student_contacts, public.student_availability,
  public.student_prices, public.student_tests, public.student_task_progress
  to authenticated;

grant select on public.driving_tasks to authenticated;
