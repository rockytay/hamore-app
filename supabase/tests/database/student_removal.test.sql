-- Removing a student keeps their history, cancels upcoming lessons and blocks new ones.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-00000000000c', 'dana@test.local',
   '{"role":"student","first_name":"דנה","last_name":"כהן","phone":"0501234567"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

update public.profiles set lesson_price = 150 where id = auth.uid();
insert into public.students (id, profile_id)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c');
select set_config('test.regular', (select id::text from public.lesson_types where name = 'שיעור רגיל'), true);

-- One lesson that already happened, one coming up.
select lives_ok(
  format($$ insert into public.lessons (id, student_id, lesson_type_id, starts_at, ends_at, status)
            values ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', %L,
                    now() - interval '2 days', now() - interval '2 days' + interval '40 minutes', 'booked'),
                   ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', %L,
                    now() + interval '2 days', now() + interval '2 days' + interval '40 minutes', 'booked') $$,
         current_setting('test.regular'), current_setting('test.regular')),
  'the teacher books a past and an upcoming lesson');

insert into public.payments (student_id, amount) values ('11111111-1111-1111-1111-111111111111', 150);

select throws_ok(
  $$ update public.students set removed_at = now()
      where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null, 'a removal needs a reason');

select lives_ok(
  $$ update public.students set removed_at = now(), removal_reason = 'passed_test'
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'the teacher removes the student because they passed the test');

select is(
  (select status from public.lessons where id = '22222222-2222-2222-2222-222222222222'),
  'cancelled', 'the upcoming lesson is cancelled');

select is(
  (select status from public.lessons where id = '22222222-2222-2222-2222-222222222221'),
  'booked', 'the past lesson stays in the history');

select is(
  (select count(*)::int from public.payments), 1, 'payments stay in the history');

select is(
  (select lessons_completed from public.student_balances
    where student_id = '11111111-1111-1111-1111-111111111111'),
  1, 'the balance still counts the lesson that happened');

select throws_ok(
  format($$ insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
            values ('11111111-1111-1111-1111-111111111111', %L,
                    now() + interval '5 days', now() + interval '5 days' + interval '40 minutes',
                    'pending', 'student') $$,
         current_setting('test.regular')),
  'HM004', null, 'no new lessons for a removed student');

select is(
  (select coalesce(removed_student_id::text, 'none') || '/' || already_added
     from public.find_student_account('dana@test.local')),
  '11111111-1111-1111-1111-111111111111/false',
  'the email lookup shows the student is on the former list');

select throws_ok(
  $$ insert into public.students (profile_id) values ('00000000-0000-0000-0000-00000000000c') $$,
  '23505', null, 'a removed student is brought back, not added a second time');

select lives_ok(
  $$ update public.students set removed_at = null, removal_reason = null, removal_note = ''
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'the teacher brings the student back');

select is(
  (select already_added from public.find_student_account('dana@test.local')),
  true, 'after coming back the student is on the active list again');

select * from finish();
rollback;
