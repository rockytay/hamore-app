-- Required student details: ID number, pickup address and (under 18) a parent, from sign-up.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'teacher@test.local',
   '{"role":"teacher","first_name":"אבי","last_name":"מורה"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'noa@test.local',
   '{"role":"student","first_name":"נועה","last_name":"לוי","phone":"0501234567",
     "birth_date":"2009-03-14","id_number":"123456782",
     "address_street":"הרצל","address_house_number":"12","address_city":"חיפה",
     "address_pickup_notes":"ליד השער",
     "parent_name":"רותי לוי","parent_phone":"050-7654321","parent_relation":"אמא"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'old@test.local',
   '{"role":"student","first_name":"דן","last_name":"כהן","phone":"0502222222","id_number":"12ab"}');

select is((select id_number from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  '123456782', 'sign-up saves the ID number');
select is((select id_number from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  null, 'an invalid ID number is left empty instead of failing the sign-up');
select is(
  (select street || ' ' || house_number || ', ' || city || ' (' || pickup_notes || ')'
     from public.student_addresses where profile_id = '00000000-0000-0000-0000-0000000000c1' and is_default),
  'הרצל 12, חיפה (ליד השער)', 'sign-up saves the default pickup address');
select is(
  (select name || ' · ' || relation from public.student_contacts
    where profile_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'parent'),
  'רותי לוי · אמא', 'sign-up saves the parent');
select is((select count(*)::int from public.student_addresses where profile_id = '00000000-0000-0000-0000-0000000000c2'),
  0, 'no address is made up when none was given');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select array[has_id_number, has_birth_date, is_minor, has_address, has_parent]
     from public.find_student_account('noa@test.local')),
  array[true, true, true, true, true],
  'finding a student says which required details they gave');
select is(
  (select array[has_id_number, has_birth_date, has_address, has_parent]
     from public.find_student_account('old@test.local')),
  array[false, false, false, false],
  'and which are missing');

insert into public.students (profile_id) values ('00000000-0000-0000-0000-0000000000c1');
select is((select id_number from public.students where profile_id = '00000000-0000-0000-0000-0000000000c1'),
  '123456782', 'adding a student copies the ID number from their account');

insert into public.student_addresses (profile_id, street, house_number, city, is_default)
values ('00000000-0000-0000-0000-0000000000c1', 'הנביאים', '3', 'חיפה', false);
select is((select count(*)::int from public.student_addresses where profile_id = '00000000-0000-0000-0000-0000000000c1'),
  2, 'the teacher can add details to their current student''s account');

select * from finish();
rollback;
