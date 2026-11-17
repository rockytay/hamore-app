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
