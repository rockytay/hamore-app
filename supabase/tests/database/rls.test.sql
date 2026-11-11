-- One teacher must never see or change another teacher's data.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- Two teachers and one student sign up. The trigger creates their profiles.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה","phone":"0501111111","driver_license_number":"7654321","teacher_license_number":"123456"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local',
   '{"role":"teacher","first_name":"בני","last_name":"מורה","phone":"0502222222"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local',
   '{"role":"student","first_name":"דנה","last_name":"תלמידה"}'),
  -- Students teachers add below. A teacher can only add someone who signed up as a student.
  ('00000000-0000-0000-0000-00000000000d', 'd@test.local',
   '{"role":"student","first_name":"יוסי","last_name":"לוי","phone":"0523333333"}'),
  ('00000000-0000-0000-0000-00000000000e', 'e@test.local',
   '{"role":"student","first_name":"זר","last_name":"זר","phone":"0524444444"}');

-- Remember A's organization while we can still see everything.
select set_config('test.org_a',
  (select organization_id::text from public.profiles
    where id = '00000000-0000-0000-0000-00000000000a'), true);

-- Sign-up trigger -----------------------------------------------------------

select is(
  (select count(distinct organization_id)::int from public.profiles
    where id::text like '00000000-0000-0000-0000-%' and organization_id is not null), 2,
  'each teacher gets an organization, the student does not');

select is(
  (select count(*)::int from public.lesson_types lt
     join public.profiles p on p.organization_id = lt.organization_id
    where p.id = '00000000-0000-0000-0000-00000000000a'),
  4, 'a new teacher gets the four default lesson types');

select is(
  (select driver_license_number || '/' || teacher_license_number || '/' || licenses_verified
     from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  '7654321/123456/false', 'sign-up saves both licence numbers; the teacher starts unverified');

select is(
  (select role || ':' || coalesce(organization_id::text, 'none')
     from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  'student:none', 'a student gets a profile without an organization');

-- Teacher A adds a student and a note -----------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$ insert into public.students (id, profile_id)
     values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000d') $$,
  'teacher A adds a student without sending an organization');

select lives_ok(
  $$ insert into public.lesson_notes (student_id, body)
     values ('11111111-1111-1111-1111-111111111111', 'שיעור ראשון') $$,
  'teacher A adds a lesson note');

select is((select count(*)::int from public.students), 1, 'teacher A sees their student');
select is((select count(*)::int from public.organizations), 1, 'teacher A sees only their organization');
select is((select count(*)::int from public.profiles), 1, 'teacher A sees only their own profile');

-- Teacher B tries to reach A's data ------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.students), 0, 'teacher B cannot read A''s students');
select is((select count(*)::int from public.lesson_notes), 0, 'teacher B cannot read A''s notes');
select is((select count(*)::int from public.profiles where id <> auth.uid()), 0,
  'teacher B cannot read other profiles');
select is((select count(*)::int from public.lesson_types), 4, 'teacher B sees only their own lesson types');

select is_empty(
  $$ update public.students set first_name = 'נפרץ'
     where id = '11111111-1111-1111-1111-111111111111' returning id $$,
  'teacher B cannot update A''s student');

select is_empty(
  $$ delete from public.students
     where id = '11111111-1111-1111-1111-111111111111' returning id $$,
  'teacher B cannot delete A''s student');

select throws_ok(
  format(
    $$ insert into public.students (organization_id, profile_id)
       values (%L, '00000000-0000-0000-0000-00000000000e') $$,
    current_setting('test.org_a')),
  '42501', null, 'teacher B cannot insert a student into A''s organization');

select throws_ok(
  $$ insert into public.lesson_notes (student_id, body)
     values ('11111111-1111-1111-1111-111111111111', 'הערה זרה') $$,
  '23503', null, 'teacher B cannot attach a note to A''s student');

select throws_ok(
  $$ update public.profiles set role = 'student' where id = auth.uid() $$,
  '42501', null, 'a user cannot change their own role');

select throws_ok(
  $$ update public.profiles set licenses_verified = true where id = auth.uid() $$,
  '42501', null, 'a teacher cannot mark themselves verified');

-- Student account ------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$ insert into public.students (profile_id) values ('00000000-0000-0000-0000-00000000000e') $$,
  '42501', null, 'a student account cannot create students');

select is((select count(*)::int from public.students), 0, 'a student account sees no students');

-- Signed out -----------------------------------------------------------------

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.students $$,
  '42501', null, 'signed-out users cannot read students');

select * from finish();
rollback;
