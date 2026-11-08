-- Hamore App — Phase 1 foundation
-- Organizations, profiles, students, lesson types and lesson notes,
-- with row-level security so a teacher only ever sees their own organization.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create schema if not exists private;

-- Lets one constraint say "same organization AND overlapping time" (used by availability and lessons).
create extension if not exists btree_gist with schema extensions;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizations: one per teacher today, room for a driving school with
-- several teachers later.
-- ---------------------------------------------------------------------------

create table public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  -- Subscription. The plan is client-editable until billing exists; see the grants below.
  plan_id        text not null default 'basic' check (plan_id in ('basic', 'pro', 'school')),
  plan_renews_at timestamptz not null default now() + interval '30 days',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, teacher or student.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  role                   text not null check (role in ('teacher', 'student')),
  -- Teachers belong to an organization. Students get one when a teacher links them.
  organization_id        uuid references public.organizations (id) on delete set null,
  first_name             text not null default '',
  last_name              text not null default '',
  phone                  text not null default '',
  email                  text not null default '',
  -- Teacher details, filled in from the profile screen.
  city                   text not null default '',
  driver_license_number  text not null default '',
  teacher_license_number text not null default '',
  -- Set by Hamore staff after checking both licence numbers; teachers can't change it.
  licenses_verified      boolean not null default false,
  teaching_categories    text[] not null default '{B}',
  car_model              text not null default '',
  transmission           text not null default 'manual' check (transmission in ('manual', 'automatic')),
  lesson_price           integer not null default 0 check (lesson_price >= 0),
  lesson_duration_min    integer not null default 40 check (lesson_duration_min > 0),
  debt_warnings          boolean not null default true,
  lesson_reminders       boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint teacher_has_organization check (role <> 'teacher' or organization_id is not null)
);

create index profiles_organization_id_idx on public.profiles (organization_id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- The signed-in user's organization. Security definer so policies can read
-- profiles without recursing into the profiles policy.
create or replace function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Lesson types: regular, double, internal test, test — editable per organization.
-- ---------------------------------------------------------------------------

create table public.lesson_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  duration_min    integer not null check (duration_min > 0),
  -- In shekels. Null means "use the teacher's default lesson price".
  price           integer check (price >= 0),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name),
  -- Lets lessons prove their lesson type belongs to the same organization.
  unique (id, organization_id)
);

create trigger lesson_types_updated_at
  before update on public.lesson_types
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------

create table public.students (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default private.current_org_id()
                   references public.organizations (id) on delete cascade,
  first_name       text not null check (length(trim(first_name)) > 0),
  last_name        text not null check (length(trim(last_name)) > 0),
  phone            text not null,
  -- Israeli ID number (teudat zehut), digits only.
  id_number        text check (id_number ~ '^\d{5,9}$'),
  license_category text not null default 'B'
                   check (license_category in ('A2', 'A1', 'A', 'B', 'C1', 'C', 'C+E', 'D1', 'D', '1')),
  transmission     text not null default 'manual' check (transmission in ('manual', 'automatic')),
  theory_passed    boolean not null default false,
  -- What the student brought from before joining this teacher. Lessons and
  -- payments tables (later phase) are added on top of these, so the totals
  -- are always calculated, never edited by hand.
  prior_lessons    integer not null default 0 check (prior_lessons >= 0),
  -- In shekels: positive is prepaid credit, negative is debt.
  opening_balance  integer not null default 0,
  -- The student's own account, once they sign up and are linked.
  profile_id       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, phone),
  -- Lets child tables prove they belong to the same organization as the student.
  unique (id, organization_id)
);

-- No separate organization_id index: the unique (organization_id, phone) index covers it.

create trigger students_updated_at
  before update on public.students
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lesson notes
-- ---------------------------------------------------------------------------

create table public.lesson_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  student_id      uuid not null,
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now(),
  -- A note can only point at a student in the same organization.
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete cascade
);

create index lesson_notes_student_id_idx on public.lesson_notes (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Availability: times the teacher opened for lessons (green in the calendar).
-- ---------------------------------------------------------------------------

create table public.availability_slots (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id()
                  references public.organizations (id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Two open-time blocks of the same teacher can't overlap.
  constraint availability_no_overlap exclude using gist (
    organization_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
);

create trigger availability_slots_updated_at
  before update on public.availability_slots
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lessons
--   pending   – waiting for the teacher (`awaiting = 'teacher'`) or the student to approve
--   booked    – both approved; once it has ended it counts as taken and is charged
--   cancelled – kept for history, never charged
-- ---------------------------------------------------------------------------

create table public.lessons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  student_id      uuid not null,
  lesson_type_id  uuid not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          text not null default 'pending' check (status in ('pending', 'booked', 'cancelled')),
  awaiting        text check (awaiting in ('teacher', 'student')),
  -- In shekels, fixed when the lesson is created so later price changes don't rewrite history.
  price           integer not null check (price >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((status = 'pending') = (awaiting is not null)),
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete cascade,
  foreign key (lesson_type_id, organization_id)
    references public.lesson_types (id, organization_id),
  -- A teacher can't have two lessons at the same time. Cancelled lessons don't count.
  constraint lessons_no_overlap exclude using gist (
    organization_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);

create index lessons_student_id_idx on public.lessons (student_id, starts_at);

create trigger lessons_updated_at
  before update on public.lessons
  for each row execute function private.set_updated_at();

-- The price of a new lesson when the app doesn't send one: the lesson type's price, or else
-- the teacher's lesson price times how many standard lessons fit in it (a double lesson = 2x).
create or replace function private.set_lesson_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price is null then
    select coalesce(
             lt.price,
             p.lesson_price * greatest(1, round(lt.duration_min::numeric / nullif(p.lesson_duration_min, 0)))::integer,
             0)
      into new.price
      from public.lesson_types lt
      left join public.profiles p on p.id = auth.uid()
     where lt.id = new.lesson_type_id;
    new.price := coalesce(new.price, 0);
  end if;
  return new;
end;
$$;

create trigger lessons_set_price
  before insert on public.lessons
  for each row execute function private.set_lesson_price();

-- ---------------------------------------------------------------------------
-- Payments from students
-- ---------------------------------------------------------------------------

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default private.current_org_id(),
  student_id      uuid not null,
  amount          integer not null check (amount > 0),
  method          text not null default 'cash'
                  check (method in ('cash', 'bit', 'paybox', 'bank_transfer', 'credit_card', 'check')),
  paid_at         timestamptz not null default now(),
  note            text not null default '',
  created_at      timestamptz not null default now(),
  foreign key (student_id, organization_id)
    references public.students (id, organization_id) on delete cascade
);

create index payments_student_id_idx on public.payments (student_id, paid_at desc);

-- ---------------------------------------------------------------------------
-- Balances, always calculated, never typed in:
--   lessons_completed = lessons before joining + booked lessons that have ended
--   balance           = opening balance + payments − price of those lessons
-- security_invoker makes the view obey the same row-level security as its tables.
-- ---------------------------------------------------------------------------

create view public.student_balances
with (security_invoker = true) as
select
  s.id as student_id,
  s.prior_lessons + coalesce(taken.lessons, 0)                         as lessons_completed,
  s.opening_balance + coalesce(paid.total, 0) - coalesce(taken.cost, 0) as balance,
  coalesce(paid.total, 0)                                               as total_paid,
  coalesce(taken.cost, 0)                                               as total_charged
from public.students s
left join lateral (
  select count(*)::integer as lessons, sum(l.price)::integer as cost
    from public.lessons l
   where l.student_id = s.id and l.status = 'booked' and l.ends_at <= now()
) taken on true
left join lateral (
  select sum(pm.amount)::integer as total
    from public.payments pm
   where pm.student_id = s.id
) paid on true;

-- ---------------------------------------------------------------------------
-- New user → profile (and for teachers: an organization and default lesson types)
-- Sign-up sends role, first_name, last_name and phone as user metadata.
-- ---------------------------------------------------------------------------

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
  org_id uuid;
begin
  if r not in ('teacher', 'student') then
    r := 'teacher';
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
                               driver_license_number, teacher_license_number)
  values (new.id, r, org_id, first, last, coalesce(meta ->> 'phone', ''), coalesce(new.email, ''),
          coalesce(meta ->> 'driver_license_number', ''), coalesce(meta ->> 'teacher_license_number', ''));

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.lesson_types  enable row level security;
alter table public.students      enable row level security;
alter table public.lesson_notes  enable row level security;
alter table public.availability_slots enable row level security;
alter table public.lessons       enable row level security;
alter table public.payments      enable row level security;

create policy "Members read their organization"
  on public.organizations for select to authenticated
  using (id = (select private.current_org_id()));

create policy "Members update their organization"
  on public.organizations for update to authenticated
  using (id = (select private.current_org_id()))
  with check (id = (select private.current_org_id()));

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Organization manages its lesson types"
  on public.lesson_types for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

create policy "Organization manages its students"
  on public.students for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

create policy "Organization manages its lesson notes"
  on public.lesson_notes for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

create policy "Organization manages its availability"
  on public.availability_slots for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

create policy "Organization manages its lessons"
  on public.lessons for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

create policy "Organization manages its payments"
  on public.payments for all to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

-- ---------------------------------------------------------------------------
-- Grants: RLS decides which rows; grants decide which columns.
-- Nothing is open to signed-out users.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_org_id() to authenticated;

grant select on public.organizations, public.profiles to authenticated;
-- TODO(billing): stop clients changing plan_id once payments exist.
grant update (name, plan_id) on public.organizations to authenticated;
-- Role, organization and email are not user-editable.
grant update (
  first_name, last_name, phone, city, driver_license_number, teacher_license_number, teaching_categories,
  car_model, transmission, lesson_price, lesson_duration_min, debt_warnings, lesson_reminders
) on public.profiles to authenticated;

grant select, insert, update, delete on
  public.lesson_types, public.students, public.lesson_notes,
  public.availability_slots, public.lessons, public.payments
  to authenticated;

grant select on public.student_balances to authenticated;
