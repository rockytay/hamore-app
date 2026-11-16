-- The student side: what a student can read and do, and one teacher per student.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה","phone":"0501111111"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local',
   '{"role":"teacher","first_name":"בני","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-00000000000c', 'dana@test.local',
   '{"role":"student","first_name":"דנה","last_name":"כהן","phone":"0501234567"}'),
  ('00000000-0000-0000-0000-00000000000d', 'yossi@test.local',
   '{"role":"student","first_name":"יוסי","last_name":"לוי","phone":"0502345678"}');

-- Open time two days from now, 08:00–12:00.
select set_config('test.slot_start', (date_trunc('day', now()) + interval '2 days 8 hours')::text, true);
select set_config('test.slot_end', (date_trunc('day', now()) + interval '2 days 12 hours')::text, true);

-- A signed-up student without a teacher ---------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is_empty($$ select * from public.my_teacher() $$, 'a student without a teacher has no teacher');

select throws_ok(
  $$ select public.request_lesson(gen_random_uuid(), now() + interval '1 day') $$,
  'HM010', null, 'a student without a teacher cannot request lessons');

-- Teacher A sets things up ----------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

update public.profiles set lesson_price = 150 where id = auth.uid();
select set_config('test.regular', (select id::text from public.lesson_types where name = 'שיעור רגיל'), true);

insert into public.students (id, profile_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c'),
  ('11111111-1111-1111-1111-222222222222', '00000000-0000-0000-0000-00000000000d');

insert into public.availability_slots (starts_at, ends_at)
values (current_setting('test.slot_start')::timestamptz, current_setting('test.slot_end')::timestamptz);

insert into public.lesson_notes (student_id, body, shared_with_student) values
  ('11111111-1111-1111-1111-111111111111', 'הערה פרטית של המורה', false),
  ('11111111-1111-1111-1111-111111111111', 'לשיעור הבא: חניה במקביל', true);

-- Yossi has a lesson at the start of the open time; Dana has one waiting for her approval.
insert into public.lessons (id, student_id, lesson_type_id, starts_at, ends_at, status, awaiting) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-222222222222',
   current_setting('test.regular')::uuid,
   current_setting('test.slot_start')::timestamptz,
   current_setting('test.slot_start')::timestamptz + interval '40 minutes', 'booked', null),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   current_setting('test.regular')::uuid,
   current_setting('test.slot_start')::timestamptz + interval '1 day',
   current_setting('test.slot_start')::timestamptz + interval '1 day 40 minutes', 'pending', 'student');

insert into public.payments (student_id, amount) values ('11111111-1111-1111-1111-111111111111', 100);

-- Teacher B can't take Dana while she is with A --------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select has_other_teacher from public.find_student_account('dana@test.local')),
  true, 'the lookup shows the student already has another teacher');

select throws_ok(
  $$ insert into public.students (profile_id) values ('00000000-0000-0000-0000-00000000000c') $$,
  'HM005', null, 'a student can have only one teacher at a time');

select is_empty($$ select * from public.my_teacher() $$, 'a teacher has no teacher of their own');

-- Dana: what she can read -------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is((select count(*)::int from public.students), 1, 'the student sees only her own student record');
select is((select count(*)::int from public.lessons), 1, 'the student sees only her own lessons');
select is((select count(*)::int from public.payments), 1, 'the student sees her payments');
select is(
  (select string_agg(body, ',') from public.lesson_notes),
  'לשיעור הבא: חניה במקביל', 'the student sees only the notes shared with her');
select is((select count(*)::int from public.availability_slots), 1, 'the student sees her teacher''s open time');
select is((select count(*)::int from public.lesson_types), 4, 'the student sees her teacher''s lesson types');
select is((select count(*)::int from public.organizations), 0, 'the student cannot read the teacher''s organization');
select is((select count(*)::int from public.profiles), 1, 'the student reads only her own profile');
select is((select first_name || ' ' || phone from public.my_teacher()), 'אבי 0501111111',
  'the student gets her teacher''s name and phone');
select is(
  (select count(*)::int from public.teacher_busy_times(now(), now() + interval '7 days')),
  2, 'the student sees when the teacher is busy');
select is((select balance from public.student_balances), 100, 'the student sees her balance');

-- Dana: what she can do ---------------------------------------------------------

select throws_ok(
  format($$ select public.request_lesson(%L, %L) $$,
         current_setting('test.regular'), current_setting('test.slot_start')),
  '23P01', null, 'a request cannot overlap another lesson');

select throws_ok(
  format($$ select public.request_lesson(%L, %L) $$,
         current_setting('test.regular'),
         (current_setting('test.slot_end')::timestamptz - interval '20 minutes')::text),
  'HM013', null, 'a request must fit inside the open time');

select throws_ok(
  format($$ select public.request_lesson(%L, %L) $$,
         current_setting('test.regular'), (now() - interval '1 hour')::text),
  'HM012', null, 'a request cannot be in the past');

select set_config('test.request',
  public.request_lesson(current_setting('test.regular')::uuid,
                        current_setting('test.slot_start')::timestamptz + interval '1 hour')::text, true);

select is(
  (select status || '/' || awaiting || '/' || price || '/' || (ends_at - starts_at)::text
     from public.lessons where id = current_setting('test.request')::uuid),
  'pending/teacher/150/00:40:00', 'a request waits for the teacher, at the teacher''s price');

select lives_ok(
  $$ select public.respond_to_lesson('22222222-2222-2222-2222-222222222222', true) $$,
  'the student approves the lesson the teacher scheduled');

select is(
  (select status from public.lessons where id = '22222222-2222-2222-2222-222222222222'),
  'booked', 'the approved lesson is booked');

select throws_ok(
  $$ select public.respond_to_lesson('22222222-2222-2222-2222-222222222222', false) $$,
  'HM015', null, 'a booked lesson cannot be declined');

select lives_ok(
  format($$ select public.cancel_lesson_request(%L) $$, current_setting('test.request')),
  'the student withdraws her request');

select is(
  (select status from public.lessons where id = current_setting('test.request')::uuid),
  'cancelled', 'the withdrawn request is cancelled');

select throws_ok(
  format($$ insert into public.lessons (organization_id, student_id, lesson_type_id, starts_at, ends_at,
                                        status, awaiting, price)
            values ((select organization_id from public.students limit 1),
                    '11111111-1111-1111-1111-111111111111', %L,
                    now() + interval '5 days', now() + interval '5 days 40 minutes', 'booked', null, 0) $$,
         current_setting('test.regular')),
  '42501', null, 'the student cannot write lessons directly');

select is_empty(
  $$ update public.lessons set price = 0 returning id $$,
  'the student cannot change lessons directly');

select is_empty(
  $$ update public.students set theory_passed = true returning id $$,
  'the student cannot change her own student record');

-- Yossi can't see Dana's things -------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';

select is(
  (select count(*)::int from public.lessons where student_id = '11111111-1111-1111-1111-111111111111'),
  0, 'another student of the same teacher cannot see her lessons');

select is(
  (select count(*)::int from public.lesson_notes), 0, 'another student cannot see her shared notes');

-- Teacher A removes Dana; she can join teacher B --------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

update public.students set removed_at = now(), removal_reason = 'other_teacher'
 where id = '11111111-1111-1111-1111-111111111111';

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is((select count(*)::int from public.lessons), 0, 'a removed student no longer sees the teacher''s data');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select lives_ok(
  $$ insert into public.students (profile_id) values ('00000000-0000-0000-0000-00000000000c') $$,
  'after leaving teacher A the student can join teacher B');

-- Teacher A can't bring her back while she is with B ----------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$ update public.students set removed_at = null, removal_reason = null
      where id = '11111111-1111-1111-1111-111111111111' $$,
  'HM005', null, 'a former student who joined another teacher cannot be brought back');

select * from finish();
rollback;
