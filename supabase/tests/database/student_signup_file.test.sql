-- The student's side of the file, entered at sign-up: licence answers, payment method,
-- referral, reminders and availability. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'teacher@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'noa@test.local',
   '{"role":"student","first_name":"נועה","last_name":"לוי","phone":"0501234567",
     "birth_date":"2007-03-14","id_number":"123456782",
     "license_category":"B","transmission":"automatic",
     "green_form_issued_at":"2026-01-10","eye_test_done":"true","needs_glasses":"true",
     "health_declaration_done":"true","theory_passed_at":"2026-05-02",
     "prior_license":"foreign","special_restrictions":"רכב מותאם",
     "preferred_payment_method":"bit","referral_source":"instagram",
     "reminder_channel":"whatsapp","reminder_hours_before":"12",
     "availability":[{"weekday":0,"start_min":960,"end_min":1140},
                     {"weekday":2,"start_min":960,"end_min":1140},
                     {"weekday":9,"start_min":960,"end_min":1140}]}'),
  ('00000000-0000-0000-0000-0000000000c2', 'bad@test.local',
   '{"role":"student","first_name":"דן","last_name":"כהן","phone":"0502222222",
     "license_category":"Z","transmission":"boat","green_form_issued_at":"2999-01-01",
     "reminder_hours_before":"9999"}');

select is(
  (select array[requested_license_category, requested_transmission, prior_license, special_restrictions,
                preferred_payment_method, referral_source, reminder_channel]
     from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  array['B', 'automatic', 'foreign', 'רכב מותאם', 'bit', 'instagram', 'whatsapp'],
  'sign-up saves the licence, payment and reminder answers');
select is(
  (select array[eye_test_done, needs_glasses, health_declaration_done]
     from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  array[true, true, true], 'and the yes/no answers');
select is(
  (select count(*)::int from public.student_availability where profile_id = '00000000-0000-0000-0000-0000000000c1'),
  2, 'sign-up saves the weekly availability and skips a day that does not exist');
select is(
  (select array[requested_license_category, requested_transmission, green_form_issued_at::text,
                reminder_hours_before::text]
     from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  array[null, null, null, '24'],
  'unexpected answers are left empty instead of failing the sign-up');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select array[license_category, transmission, green_form_issued_at::text, theory_passed_at::text]
     from public.find_student_account('noa@test.local')),
  array['B', 'automatic', '2026-01-10', '2026-05-02'],
  'finding a student returns their licence answers for the add-student form');
select is(
  (select answered_licence from public.find_student_account('bad@test.local')),
  false, 'and says when the student was not asked');

-- The teacher leaves the licence file empty: it is filled from the student's answers.
insert into public.students (profile_id) values ('00000000-0000-0000-0000-0000000000c1');
select is(
  (select array[green_form_issued_at::text, theory_passed_at::text, theory_passed::text,
                preferred_payment_method, referral_source, special_restrictions]
     from public.students where profile_id = '00000000-0000-0000-0000-0000000000c1'),
  array['2026-01-10', '2026-05-02', 'true', 'bit', 'instagram', 'רכב מותאם'],
  'adding a student fills the empty file fields from their answers');

reset role;
delete from public.students where profile_id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;

-- The teacher's own answers win.
insert into public.students (profile_id, green_form_issued_at, preferred_payment_method)
values ('00000000-0000-0000-0000-0000000000c1', '2026-02-01', 'cash');
select is(
  (select array[green_form_issued_at::text, preferred_payment_method]
     from public.students where profile_id = '00000000-0000-0000-0000-0000000000c1'),
  array['2026-02-01', 'cash'], 'what the teacher entered is kept');

-- The student can correct their own answers.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
update public.profiles set requested_transmission = 'manual' where id = '00000000-0000-0000-0000-0000000000c1';
select is((select requested_transmission from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'manual', 'the student can correct their answers');

select * from finish();
rollback;
