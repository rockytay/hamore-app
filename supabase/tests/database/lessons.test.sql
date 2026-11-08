-- Calendar, lessons, payments and calculated balances.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(28);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local',
   '{"role":"teacher","first_name":"בני","last_name":"מורה"}');

-- Teacher A ------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

update public.profiles set lesson_price = 150, lesson_duration_min = 40 where id = auth.uid();

insert into public.students (id, first_name, last_name, phone, prior_lessons, opening_balance)
values ('11111111-1111-1111-1111-111111111111', 'יוסי', 'לוי', '0523333333', 3, -100);

select set_config('test.regular', (select id::text from public.lesson_types where name = 'שיעור רגיל'), true);
select set_config('test.double',  (select id::text from public.lesson_types where name = 'שיעור כפול'), true);

-- Availability

select lives_ok(
  $$ insert into public.availability_slots (starts_at, ends_at)
     values ('2030-01-06 09:00+02', '2030-01-06 12:00+02') $$,
  'teacher A opens time in the calendar');

select throws_ok(
  $$ insert into public.availability_slots (starts_at, ends_at)
     values ('2030-01-06 11:00+02', '2030-01-06 13:00+02') $$,
  '23P01', null, 'two open-time blocks can''t overlap');

select throws_ok(
  $$ insert into public.availability_slots (starts_at, ends_at)
     values ('2030-01-06 12:00+02', '2030-01-06 11:00+02') $$,
  '23514', null, 'open time must end after it starts');

-- Lessons and prices

select lives_ok(
  format($$ insert into public.lessons (id, student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
            values ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', %L,
                    '2030-01-06 09:00+02', '2030-01-06 09:40+02', 'pending', 'student') $$,
         current_setting('test.regular')),
  'teacher A schedules a lesson inside the open time');

select is((select price from public.lessons where id = '22222222-2222-2222-2222-222222222221'), 150,
  'a regular lesson gets the teacher''s lesson price');

select lives_ok(
  format($$ insert into public.lessons (id, student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
            values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', %L,
                    '2030-01-06 10:00+02', '2030-01-06 11:20+02', 'pending', 'student') $$,
         current_setting('test.double')),
  'teacher A schedules a double lesson');

select is((select price from public.lessons where id = '22222222-2222-2222-2222-222222222222'), 300,
  'a double lesson costs twice the lesson price');

select lives_ok(
  format($$ insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status, awaiting, price)
            values ('11111111-1111-1111-1111-111111111111', %L,
                    '2030-01-07 09:00+02', '2030-01-07 09:40+02', 'pending', 'student', 120) $$,
         current_setting('test.regular')),
  'the app can set a special price for one lesson');

select throws_ok(
  format($$ insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
            values ('11111111-1111-1111-1111-111111111111', %L,
                    '2030-01-06 09:20+02', '2030-01-06 10:00+02', 'pending', 'student') $$,
         current_setting('test.regular')),
  '23P01', null, 'two lessons can''t overlap');

select lives_ok(
  $$ update public.lessons set status = 'cancelled', awaiting = null
     where id = '22222222-2222-2222-2222-222222222221' $$,
  'teacher A cancels a lesson');

select lives_ok(
  format($$ insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
            values ('11111111-1111-1111-1111-111111111111', %L,
                    '2030-01-06 09:00+02', '2030-01-06 09:40+02', 'pending', 'teacher') $$,
         current_setting('test.regular')),
  'a cancelled lesson frees its time');

select throws_ok(
  format($$ insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
            values ('11111111-1111-1111-1111-111111111111', %L,
                    '2030-01-08 09:00+02', '2030-01-08 09:40+02', 'booked', 'student') $$,
         current_setting('test.regular')),
  '23514', null, 'only a pending lesson can be waiting for someone');

-- Balances: past booked lessons are charged, payments are credited

insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status)
values ('11111111-1111-1111-1111-111111111111', current_setting('test.regular')::uuid,
        now() - interval '2 days', now() - interval '2 days' + interval '40 minutes', 'booked'),
       ('11111111-1111-1111-1111-111111111111', current_setting('test.double')::uuid,
        now() - interval '1 day', now() - interval '1 day' + interval '80 minutes', 'booked');

select lives_ok(
  $$ insert into public.payments (student_id, amount, method)
     values ('11111111-1111-1111-1111-111111111111', 500, 'bit') $$,
  'teacher A records a payment');

select throws_ok(
  $$ insert into public.payments (student_id, amount) values ('11111111-1111-1111-1111-111111111111', 0) $$,
  '23514', null, 'a payment must be more than zero');

select is(
  (select lessons_completed from public.student_balances
    where student_id = '11111111-1111-1111-1111-111111111111'),
  5, 'lessons completed = 3 before joining + 2 booked lessons that ended');

select is(
  (select balance from public.student_balances
    where student_id = '11111111-1111-1111-1111-111111111111'),
  -50, 'balance = -100 opening + 500 paid - 150 - 300 for the two past lessons');

select is(
  (select total_charged from public.student_balances
    where student_id = '11111111-1111-1111-1111-111111111111'),
  450, 'future, pending and cancelled lessons are not charged');

-- Teacher B ------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.availability_slots), 0, 'teacher B can''t see A''s open time');
select is((select count(*)::int from public.lessons), 0, 'teacher B can''t see A''s lessons');
select is((select count(*)::int from public.payments), 0, 'teacher B can''t see A''s payments');
select is((select count(*)::int from public.student_balances), 0, 'teacher B can''t see A''s balances');

select lives_ok(
  $$ insert into public.availability_slots (starts_at, ends_at)
     values ('2030-01-06 09:00+02', '2030-01-06 12:00+02') $$,
  'teacher B can open the same hours as A (different teacher)');

select throws_ok(
  format($$ insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
            values ('11111111-1111-1111-1111-111111111111', %L,
                    '2030-02-01 09:00+02', '2030-02-01 09:40+02', 'pending', 'student') $$,
         (select id from public.lesson_types limit 1)),
  '23503', null, 'teacher B can''t book a lesson for A''s student');

select throws_ok(
  $$ insert into public.payments (student_id, amount) values ('11111111-1111-1111-1111-111111111111', 100) $$,
  '23503', null, 'teacher B can''t record a payment for A''s student');

select is_empty(
  $$ update public.lessons set status = 'cancelled', awaiting = null returning id $$,
  'teacher B can''t cancel A''s lessons');

select is_empty(
  $$ delete from public.payments returning id $$,
  'teacher B can''t delete A''s payments');

-- B's own student, but A's lesson type
insert into public.students (id, first_name, last_name, phone)
values ('33333333-3333-3333-3333-333333333333', 'רון', 'דהן', '0548901234');

select throws_ok(
  format($$ insert into public.lessons (student_id, lesson_type_id, starts_at, ends_at, status, awaiting)
            values ('33333333-3333-3333-3333-333333333333', %L,
                    '2030-02-01 09:00+02', '2030-02-01 09:40+02', 'pending', 'student') $$,
         current_setting('test.regular')),
  '23503', null, 'teacher B can''t use A''s lesson types');

-- Signed out -----------------------------------------------------------------

reset role;
set local role anon;

select throws_ok($$ select * from public.lessons $$, '42501', null, 'signed-out users can''t read lessons');

select * from finish();
rollback;
