-- Deleting your own account: the feedback is kept, the right data goes, the rest stays.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-00000000000c', 'dana@test.local',
   '{"role":"student","first_name":"דנה","last_name":"כהן","phone":"0501234567"}'),
  ('00000000-0000-0000-0000-00000000000d', 'yossi@test.local',
   '{"role":"student","first_name":"יוסי","last_name":"לוי","phone":"0502345678"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select set_config('test.org', (select organization_id::text from public.profiles where id = auth.uid()), true);
select set_config('test.regular', (select id::text from public.lesson_types where name = 'שיעור רגיל'), true);
insert into public.students (id, profile_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c'),
  ('11111111-1111-1111-1111-222222222222', '00000000-0000-0000-0000-00000000000d');
insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status, awaiting) values
  ('11111111-1111-1111-1111-111111111111', current_setting('test.regular')::uuid,
   now() + interval '3 days', now() + interval '3 days 40 minutes', 'booked', null);
insert into public.payments (student_id, amount) values ('11111111-1111-1111-1111-111111111111', 100);

-- Nobody reads the feedback from the app ------------------------------------------

select throws_ok(
  $$ select * from public.account_deletion_feedback $$,
  '42501', null, 'app users cannot read the deletion feedback');

-- Dana (student) deletes her account ------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select throws_ok(
  $$ select public.delete_my_account('other', null, '  ', '', '', '') $$,
  'HM021', null, 'a student must describe an "other" reason');
select throws_ok(
  $$ select public.delete_my_account(null, null, '', '', '', '') $$,
  'HM021', null, 'a student must give a reason');

select lives_ok(
  $$ select public.delete_my_account('passed_test', null, '', 'יותר תזכורות', '1.0.0', 'ios') $$,
  'a student deletes their account');

reset role;

select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-00000000000c'), 0,
  'the student''s login is gone');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 0,
  'the student''s profile is gone');
select is(
  (select removal_reason from public.students where id = '11111111-1111-1111-1111-111111111111'),
  'passed_test', 'the teacher''s list records why the student left');
select is(
  (select count(*)::int from public.lessons
    where student_id = '11111111-1111-1111-1111-111111111111' and status <> 'cancelled'), 0,
  'the student''s upcoming lessons are cancelled');
select is(
  (select count(*)::int from public.payments where student_id = '11111111-1111-1111-1111-111111111111'), 1,
  'the teacher keeps the payment history');
select is(
  (select reason || ' / ' || improvements || ' / ' || (stats ->> 'had_teacher')
     from public.account_deletion_feedback where role = 'student'),
  'passed_test / יותר תזכורות / true', 'the student''s feedback is kept');

-- Teacher A deletes the account -----------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$ select public.delete_my_account(null, false, '', '', '', '') $$,
  'HM021', null, 'an unsatisfied teacher must say what went wrong');

select lives_ok(
  $$ select public.delete_my_account(null, false, 'היומן מסובך', 'תצוגה יומית', '1.0.0', 'android') $$,
  'a teacher deletes their account');

reset role;

select is((select count(*)::int from public.organizations where id = current_setting('test.org')::uuid), 0,
  'the teacher''s organization and its data are deleted');
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000d'), 1,
  'the teacher''s students keep their own accounts');

select * from finish();
rollback;
