-- A teacher can only add students who already have a student account.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local',
   '{"role":"teacher","first_name":"בני","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-00000000000c', 'dana@test.local',
   '{"role":"student","first_name":"דנה","last_name":"כהן","phone":"0501234567"}');

-- Teacher A ------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$ insert into public.students (first_name, last_name, phone) values ('מומצא', 'מומצא', '0529999999') $$,
  'HM001', null, 'a teacher cannot type in a student who has no account');

select throws_ok(
  $$ insert into public.students (profile_id) values ('00000000-0000-0000-0000-00000000000b') $$,
  'HM002', null, 'a teacher account cannot be added as a student');

select is(
  (select first_name || ' ' || last_name || ' ' || phone from public.find_student_account('  DANA@test.local ')),
  'דנה כהן 0501234567', 'a teacher finds a student account by email (name and phone), ignoring case and spaces');

select is(
  (select already_added from public.find_student_account('dana@test.local')),
  false, 'the student is not on the teacher''s list yet');

select is_empty(
  $$ select * from public.find_student_account('nobody@test.local') $$,
  'an unknown email finds nothing');

select is_empty(
  $$ select * from public.find_student_account('b@test.local') $$,
  'a teacher''s email is not offered as a student');

select lives_ok(
  $$ insert into public.students (id, profile_id, first_name, last_name, phone)
     values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c',
             'שם', 'אחר', '0520000000') $$,
  'teacher A adds the student from their account');

select is(
  (select first_name || ' ' || last_name || ' ' || phone from public.students),
  'דנה כהן 0501234567', 'the name and phone come from the student''s account, not the teacher');

select is(
  (select already_added from public.find_student_account('dana@test.local')),
  true, 'the lookup shows the student is already on the list');

select throws_ok(
  $$ insert into public.students (profile_id) values ('00000000-0000-0000-0000-00000000000c') $$,
  '23505', null, 'the same student cannot be added twice by one teacher');

select throws_ok(
  $$ update public.students set profile_id = '00000000-0000-0000-0000-00000000000b'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'HM003', null, 'a student row cannot be moved to another account');

-- Teacher B ------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select already_added from public.find_student_account('dana@test.local')),
  false, 'another teacher sees only their own list in the lookup');

-- Student --------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is_empty(
  $$ select * from public.find_student_account('dana@test.local') $$,
  'a student cannot use the lookup');

-- Signed out -----------------------------------------------------------------

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.find_student_account('dana@test.local') $$,
  '42501', null, 'signed-out users cannot use the lookup');

-- The student deletes their account ------------------------------------------

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';

select is(
  (select coalesce(profile_id::text, 'none') from public.students
    where id = '11111111-1111-1111-1111-111111111111'),
  'none', 'the teacher keeps the student''s history after the account is deleted');

select * from finish();
rollback;
