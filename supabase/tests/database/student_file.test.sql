-- The student file: who can read and change the student's details and the teacher's file.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה","phone":"0501111111"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local',
   '{"role":"teacher","first_name":"בני","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-00000000000c', 'dana@test.local',
   '{"role":"student","first_name":"דנה","last_name":"כהן","phone":"0501234567",
     "birth_date":"2009-03-14","preferred_language":"ru","privacy_consent":"true"}'),
  ('00000000-0000-0000-0000-00000000000d', 'yossi@test.local',
   '{"role":"student","first_name":"יוסי","last_name":"לוי","phone":"0502345678",
     "birth_date":"2009-02-31","preferred_language":"xx"}');

-- One driving task, as the later migration with the official list will add.
insert into public.driving_tasks (id, stage, sort_order, title) values (1, 1, 1, 'התנעה ויציאה לדרך');

select set_config('test.slot_start', (date_trunc('day', now()) + interval '2 days 8 hours')::text, true);
select set_config('test.slot_end', (date_trunc('day', now()) + interval '2 days 12 hours')::text, true);

-- Sign-up -------------------------------------------------------------------------

select is(
  (select birth_date from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  date '2009-03-14', 'sign-up saves the birth date');
select is(
  (select preferred_language from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  'ru', 'sign-up saves the language');
select isnt(
  (select privacy_consent_at from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  null, 'sign-up records the privacy consent');
select is(
  (select birth_date from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
  null, 'an impossible birth date is left empty instead of failing the sign-up');
select is(
  (select preferred_language from public.profiles where id = '00000000-0000-0000-0000-00000000000d'),
  'he', 'an unknown language falls back to Hebrew');

-- Dana fills in her own details before she has a teacher ----------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select lives_ok(
  $$ insert into public.student_addresses (profile_id, label, street, house_number, city, is_default)
     values (auth.uid(), 'בית', 'הרצל', '10', 'חיפה', true) $$,
  'a student adds their own pickup address');
select lives_ok(
  $$ insert into public.student_contacts (profile_id, kind, name, phone, relation, is_payer)
     values (auth.uid(), 'parent', 'מירב כהן', '0509999999', 'אמא', true) $$,
  'a student adds a parent contact');
select lives_ok(
  $$ insert into public.student_availability (profile_id, weekday, start_min, end_min)
     values (auth.uid(), 0, 960, 1140) $$,
  'a student adds their weekly availability');
select throws_ok(
  $$ insert into public.student_addresses (profile_id, street, city)
     values ('00000000-0000-0000-0000-00000000000d', 'רחוב', 'עיר') $$,
  '42501', null, 'a student cannot add details to another student''s account');

-- Teacher A adds Dana and sets up her file ------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

update public.profiles set lesson_price = 150, theory_valid_years = 4 where id = auth.uid();
select set_config('test.regular', (select id::text from public.lesson_types where name = 'שיעור רגיל'), true);

insert into public.students (id, profile_id, green_form_issued_at, theory_passed, theory_passed_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c',
        current_date - 30, true, current_date - 10);

insert into public.availability_slots (starts_at, ends_at)
values (current_setting('test.slot_start')::timestamptz, current_setting('test.slot_end')::timestamptz);

select is(
  (select birth_date from public.profiles where id = '00000000-0000-0000-0000-00000000000c'),
  date '2009-03-14', 'the teacher reads their student''s birth date');
select is(
  (select count(*)::int from public.student_addresses), 1, 'the teacher sees their student''s address');
select lives_ok(
  $$ update public.student_addresses set pickup_notes = 'ליד השער האחורי'
      where profile_id = '00000000-0000-0000-0000-00000000000c' $$,
  'the teacher can correct their student''s address');

insert into public.student_prices (student_id, lesson_type_id, price)
values ('11111111-1111-1111-1111-111111111111', current_setting('test.regular')::uuid, 120);

insert into public.lessons (id, student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
values ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111',
        current_setting('test.regular')::uuid,
        current_setting('test.slot_start')::timestamptz,
        current_setting('test.slot_start')::timestamptz + interval '40 minutes', 'booked', null);

select is(
  (select price from public.lessons where id = '22222222-2222-2222-2222-222222222221'),
  120, 'a lesson the teacher schedules uses the student''s own price');

insert into public.student_tests (student_id, kind, scheduled_at, location)
values ('11111111-1111-1111-1111-111111111111', 'practical', now() + interval '10 days', 'מגרש חיפה');

insert into public.student_task_progress (student_id, task_id, status)
values ('11111111-1111-1111-1111-111111111111', 1, 'mastered');

-- Teacher B sees none of it ---------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is_empty(
  $$ select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000c' $$,
  'another teacher cannot read the student''s account');
select is_empty($$ select 1 from public.student_addresses $$, 'another teacher sees no addresses');
select is_empty($$ select 1 from public.student_tests $$, 'another teacher sees no tests');

-- Dana reads her file -----------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is((select count(*)::int from public.student_tests), 1, 'the student reads their tests');
select is(
  (select status from public.student_task_progress where task_id = 1), 'mastered',
  'the student reads their task progress');
select is((select theory_valid_years from public.my_teacher()), 4, 'the student gets the teacher''s validity settings');
select set_config('test.requested', public.request_lesson(
  current_setting('test.regular')::uuid,
  current_setting('test.slot_start')::timestamptz + interval '1 hour')::text, true);
select is(
  (select price from public.lessons where id = current_setting('test.requested')::uuid),
  120, 'a lesson the student requests uses their own price');

select throws_ok(
  $$ insert into public.student_tests (organization_id, student_id, kind, scheduled_at)
     select organization_id, id, 'internal', now() + interval '1 day' from public.students $$,
  '42501', null, 'a student cannot add tests');

update public.students set status = 'frozen', test_readiness = 5;
select is(
  (select status from public.students), 'active', 'a student cannot change the teacher''s file');

-- A frozen student can't request lessons ------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update public.students set status = 'frozen' where id = '11111111-1111-1111-1111-111111111111';

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select throws_ok(
  $$ select public.request_lesson(current_setting('test.regular')::uuid,
                                  current_setting('test.slot_start')::timestamptz + interval '2 hours') $$,
  'HM017', null, 'a frozen student cannot request lessons');

-- Yossi sees nothing of Dana's -----------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';
select is_empty($$ select 1 from public.student_contacts $$, 'another student sees no contacts');

select * from finish();
rollback;
