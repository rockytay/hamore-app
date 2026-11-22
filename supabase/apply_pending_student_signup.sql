-- Brings the hosted database up to date for student sign-up.
-- The hosted project has migrations up to 20261119 but is missing:
--   20261120120000_student_required_fields.sql  (profiles.id_number, address + parent at sign-up)
--   20261121120000_student_signup_file.sql      (licence answers, payment, referral, reminders, availability)
-- Without them, students.special_restrictions / profiles.id_number / profiles.requested_* do not
-- exist, and the sign-up trigger in the database is an older version that ignores most of the form.
-- Paste this whole file into Supabase Dashboard -> SQL Editor and Run. Safe to run more than once.
-- (Alternative: `npx supabase link --project-ref ovqolxqznfbxynrjvzny` then `npx supabase db push`.)

begin;

-- ===================== 20261120120000_student_required_fields.sql =====================
-- The details every student must have (🔴 in the student file research):
--   * ID number, now also on the student's own account, so they enter it once at sign-up.
--     A teacher who adds the student gets it copied into their file.
--   * A default pickup address and, under 18, a parent contact, entered at sign-up.
-- The teacher's add-student form fills whatever the student did not.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- ID number on the account
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists id_number text check (id_number is null or id_number ~ '^\d{5,9}$');

-- The student edits their own (the profile update policy allows only their own row).
grant update (id_number) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up saves the ID number, the pickup address and the parent
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
  lang   text  := coalesce(meta ->> 'preferred_language', 'he');
  born   date  := private.try_date(meta ->> 'birth_date');
  id_no  text  := nullif(regexp_replace(coalesce(meta ->> 'id_number', ''), '\D', '', 'g'), '');
  street text  := trim(coalesce(meta ->> 'address_street', ''));
  city   text  := trim(coalesce(meta ->> 'address_city', ''));
  parent text  := trim(coalesce(meta ->> 'parent_name', ''));
  pphone text  := trim(coalesce(meta ->> 'parent_phone', ''));
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
  if id_no is not null and id_no !~ '^\d{5,9}$' then
    id_no := null;
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
                               birth_date, preferred_language, privacy_consent_at, marketing_consent,
                               id_number)
  values (new.id, r, org_id, first, last, coalesce(meta ->> 'phone', ''), coalesce(new.email, ''),
          coalesce(meta ->> 'driver_license_number', ''), coalesce(meta ->> 'teacher_license_number', ''),
          born, lang,
          case when (meta ->> 'privacy_consent') = 'true' then now() end,
          coalesce((meta ->> 'marketing_consent') = 'true', false),
          case when r = 'student' then id_no end);

  if r = 'student' and street <> '' and city <> '' then
    insert into public.student_addresses (profile_id, label, street, house_number, city, pickup_notes, is_default)
    values (new.id, 'בית', street, trim(coalesce(meta ->> 'address_house_number', '')), city,
            trim(coalesce(meta ->> 'address_pickup_notes', '')), true);
  end if;

  if r = 'student' and parent <> '' and pphone <> '' then
    insert into public.student_contacts (profile_id, kind, name, phone, relation, is_payer)
    values (new.id, 'parent', parent, pphone, trim(coalesce(meta ->> 'parent_relation', '')), false);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Adding a student copies the ID number from their account when the teacher left it empty
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
  new.id_number  := coalesce(nullif(new.id_number, ''), account.id_number);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finding a student by email also says which required details they already gave,
-- so the add-student form asks only for the rest. Only yes/no answers: the details
-- themselves stay private until the student is on the teacher's list.
-- ---------------------------------------------------------------------------

drop function if exists public.find_student_account(text);

create function public.find_student_account(student_email text)
returns table (
  profile_id uuid,
  first_name text,
  last_name text,
  phone text,
  already_added boolean,
  removed_student_id uuid,
  has_other_teacher boolean,
  has_id_number boolean,
  has_birth_date boolean,
  is_minor boolean,
  has_address boolean,
  has_parent boolean
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
         ),
         p.id_number is not null,
         p.birth_date is not null,
         coalesce(p.birth_date > current_date - interval '18 years', false),
         exists (select 1 from public.student_addresses a where a.profile_id = p.id),
         exists (select 1 from public.student_contacts c where c.profile_id = p.id and c.kind = 'parent')
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

notify pgrst, 'reload schema';

-- ===================== 20261121120000_student_signup_file.sql =====================
-- The student fills in their side of the student file at sign-up (sections 4, 7, 8 and 9
-- of the student file research), so the teacher does not have to ask again:
--   * Licence ("תיק משרד התחבורה"): category, gearbox, green form and its date, eye test and
--     glasses, health declaration (yes/no only), theory and its date, previous licence,
--     special restrictions.
--   * Preferred payment method, how they heard about the teacher.
--   * Weekly availability and reminder preferences (columns and table from 20261117).
-- The answers are kept on the student's account. When a teacher adds the student, the
-- add-student form starts from them and the teacher confirms; whatever the teacher leaves
-- empty is copied from the account.
-- Lessons, tests, prices, payment plan and status stay the teacher's: the student can't
-- know or decide them at sign-up.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The student's answers, on their account
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- Null on accounts made before this migration: the student was not asked.
  add column if not exists requested_license_category text
    check (requested_license_category in ('A2', 'A1', 'A', 'B', 'C1', 'C', 'C+E', 'D1', 'D', '1')),
  add column if not exists requested_transmission     text
    check (requested_transmission in ('manual', 'automatic')),
  add column if not exists green_form_issued_at       date,
  add column if not exists eye_test_done              boolean not null default false,
  add column if not exists needs_glasses              boolean not null default false,
  -- Yes/no only. Medical details are never stored.
  add column if not exists health_declaration_done    boolean not null default false,
  add column if not exists theory_passed_at           date,
  add column if not exists prior_license              text not null default 'none'
    check (prior_license in ('none', 'add_category', 'conversion', 'foreign', 'renewal')),
  -- e.g. "רכב מותאם". Not a medical description.
  add column if not exists special_restrictions       text not null default ''
    check (length(special_restrictions) <= 200),
  add column if not exists preferred_payment_method   text
    check (preferred_payment_method in ('cash', 'bit', 'paybox', 'bank_transfer', 'credit_card', 'check')),
  add column if not exists referral_source            text
    check (referral_source in ('recommendation', 'instagram', 'facebook', 'google', 'other'));

grant update (
  requested_license_category, requested_transmission, green_form_issued_at, eye_test_done,
  needs_glasses, health_declaration_done, theory_passed_at, prior_license, special_restrictions,
  preferred_payment_method, referral_source
) on public.profiles to authenticated;

-- The teacher's file gets the special restrictions too.
alter table public.students
  add column if not exists special_restrictions text not null default ''
    check (length(special_restrictions) <= 200);

-- ---------------------------------------------------------------------------
-- Sign-up saves the answers, the reminder preferences and the weekly availability
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r        text  := coalesce(meta ->> 'role', 'teacher');
  first    text  := coalesce(meta ->> 'first_name', '');
  last     text  := coalesce(meta ->> 'last_name', '');
  lang     text  := coalesce(meta ->> 'preferred_language', 'he');
  born     date  := private.try_date(meta ->> 'birth_date');
  id_no    text  := nullif(regexp_replace(coalesce(meta ->> 'id_number', ''), '\D', '', 'g'), '');
  street   text  := trim(coalesce(meta ->> 'address_street', ''));
  city     text  := trim(coalesce(meta ->> 'address_city', ''));
  parent   text  := trim(coalesce(meta ->> 'parent_name', ''));
  pphone   text  := trim(coalesce(meta ->> 'parent_phone', ''));
  category text  := meta ->> 'license_category';
  gearbox  text  := meta ->> 'transmission';
  green    date  := private.try_date(meta ->> 'green_form_issued_at');
  theory   date  := private.try_date(meta ->> 'theory_passed_at');
  prior    text  := coalesce(meta ->> 'prior_license', 'none');
  paying   text  := meta ->> 'preferred_payment_method';
  referral text  := meta ->> 'referral_source';
  channel  text  := coalesce(meta ->> 'reminder_channel', 'push');
  hours    integer;
  win      jsonb;
  org_id   uuid;
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
  if id_no is not null and id_no !~ '^\d{5,9}$' then
    id_no := null;
  end if;

  -- Anything unexpected is left empty rather than failing the sign-up.
  if category not in ('A2', 'A1', 'A', 'B', 'C1', 'C', 'C+E', 'D1', 'D', '1') then category := null; end if;
  if gearbox not in ('manual', 'automatic') then gearbox := null; end if;
  if green > current_date then green := null; end if;
  if theory > current_date then theory := null; end if;
  if prior not in ('none', 'add_category', 'conversion', 'foreign', 'renewal') then prior := 'none'; end if;
  if paying not in ('cash', 'bit', 'paybox', 'bank_transfer', 'credit_card', 'check') then paying := null; end if;
  if referral not in ('recommendation', 'instagram', 'facebook', 'google', 'other') then referral := null; end if;
  if channel not in ('push', 'sms', 'whatsapp') then channel := 'push'; end if;
  hours := case when (meta ->> 'reminder_hours_before') ~ '^\d{1,3}$'
                then (meta ->> 'reminder_hours_before')::integer end;
  if hours is null or hours not between 1 and 168 then hours := 24; end if;

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
                               birth_date, preferred_language, privacy_consent_at, marketing_consent,
                               id_number)
  values (new.id, r, org_id, first, last, coalesce(meta ->> 'phone', ''), coalesce(new.email, ''),
          coalesce(meta ->> 'driver_license_number', ''), coalesce(meta ->> 'teacher_license_number', ''),
          born, lang,
          case when (meta ->> 'privacy_consent') = 'true' then now() end,
          coalesce((meta ->> 'marketing_consent') = 'true', false),
          case when r = 'student' then id_no end);

  if r <> 'student' then
    return new;
  end if;

  update public.profiles
     set requested_license_category = category,
         requested_transmission     = gearbox,
         green_form_issued_at       = green,
         eye_test_done              = coalesce((meta ->> 'eye_test_done') = 'true', false),
         needs_glasses              = coalesce((meta ->> 'needs_glasses') = 'true', false),
         health_declaration_done    = coalesce((meta ->> 'health_declaration_done') = 'true', false),
         theory_passed_at           = theory,
         prior_license              = prior,
         special_restrictions       = left(trim(coalesce(meta ->> 'special_restrictions', '')), 200),
         preferred_payment_method   = paying,
         referral_source            = referral,
         reminder_channel           = channel,
         reminder_hours_before      = hours
   where id = new.id;

  if street <> '' and city <> '' then
    insert into public.student_addresses (profile_id, label, street, house_number, city, pickup_notes, is_default)
    values (new.id, 'בית', street, trim(coalesce(meta ->> 'address_house_number', '')), city,
            trim(coalesce(meta ->> 'address_pickup_notes', '')), true);
  end if;

  if parent <> '' and pphone <> '' then
    insert into public.student_contacts (profile_id, kind, name, phone, relation, is_payer)
    values (new.id, 'parent', parent, pphone, trim(coalesce(meta ->> 'parent_relation', '')), false);
  end if;

  -- Weekly availability: [{"weekday":0,"start_min":960,"end_min":1140}, ...]. Bad entries are skipped.
  if jsonb_typeof(meta -> 'availability') = 'array' then
    for win in select * from jsonb_array_elements(meta -> 'availability') limit 21 loop
      begin
        if (win ->> 'weekday')::smallint between 0 and 6
           and (win ->> 'start_min')::integer between 0 and 1439
           and (win ->> 'end_min')::integer between 1 and 1440
           and (win ->> 'end_min')::integer > (win ->> 'start_min')::integer then
          insert into public.student_availability (profile_id, weekday, start_min, end_min)
          values (new.id, (win ->> 'weekday')::smallint, (win ->> 'start_min')::integer,
                  (win ->> 'end_min')::integer);
        end if;
      exception when others then
        null;
      end;
    end loop;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Adding a student fills what the teacher left empty from the student's answers
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
  new.id_number  := coalesce(nullif(new.id_number, ''), account.id_number);

  new.green_form_issued_at     := coalesce(new.green_form_issued_at, account.green_form_issued_at);
  new.theory_passed_at         := coalesce(new.theory_passed_at, account.theory_passed_at);
  new.theory_passed            := new.theory_passed or new.theory_passed_at is not null;
  new.preferred_payment_method := coalesce(new.preferred_payment_method, account.preferred_payment_method);
  new.referral_source          := coalesce(new.referral_source, account.referral_source);
  new.special_restrictions     := coalesce(nullif(new.special_restrictions, ''), account.special_restrictions, '');
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finding a student by email also returns their licence answers, so the add-student form
-- starts from them. The ID number, address and contacts stay yes/no until the student is
-- on the teacher's list.
-- ---------------------------------------------------------------------------

drop function if exists public.find_student_account(text);

create function public.find_student_account(student_email text)
returns table (
  profile_id uuid,
  first_name text,
  last_name text,
  phone text,
  already_added boolean,
  removed_student_id uuid,
  has_other_teacher boolean,
  has_id_number boolean,
  has_birth_date boolean,
  is_minor boolean,
  has_address boolean,
  has_parent boolean,
  answered_licence boolean,
  license_category text,
  transmission text,
  green_form_issued_at date,
  eye_test_done boolean,
  needs_glasses boolean,
  health_declaration_done boolean,
  theory_passed_at date,
  prior_license text,
  special_restrictions text,
  preferred_payment_method text,
  referral_source text
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
         ),
         p.id_number is not null,
         p.birth_date is not null,
         coalesce(p.birth_date > current_date - interval '18 years', false),
         exists (select 1 from public.student_addresses a where a.profile_id = p.id),
         exists (select 1 from public.student_contacts c where c.profile_id = p.id and c.kind = 'parent'),
         p.requested_license_category is not null,
         p.requested_license_category,
         p.requested_transmission,
         p.green_form_issued_at,
         p.eye_test_done,
         p.needs_glasses,
         p.health_declaration_done,
         p.theory_passed_at,
         p.prior_license,
         p.special_restrictions,
         p.preferred_payment_method,
         p.referral_source
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

notify pgrst, 'reload schema';

-- Record them as applied, so a later `supabase db push` does not try to run them again.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute $q$
      insert into supabase_migrations.schema_migrations (version, name)
      select v, n from (values
        ('20261120120000', 'student_required_fields'),
        ('20261121120000', 'student_signup_file')
      ) as m(v, n)
      where not exists (select 1 from supabase_migrations.schema_migrations s where s.version = m.v)
    $q$;
  end if;
end;
$$;

commit;
