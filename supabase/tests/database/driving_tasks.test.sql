-- The official licence B task list and the "not relevant" status.
begin;
select plan(7);

select is((select count(*)::int from public.driving_tasks where license_category = 'B'), 52, '52 tasks for licence B');
select is((select count(*)::int from public.driving_tasks where stage = 1), 21, 'stage 1 has 21 tasks');
select is((select count(*)::int from public.driving_tasks where stage = 2), 12, 'stage 2 has 12 tasks');
select is((select count(*)::int from public.driving_tasks where stage = 3), 10, 'stage 3 has 10 tasks');
select is((select count(*)::int from public.driving_tasks where stage = 4), 9, 'stage 4 has 9 tasks');
select is(
  (select array_agg(code order by sort_order) from public.driving_tasks where id in (1, 52)),
  array['1.1.1', '4.2.4'],
  'tasks keep the official order and codes');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'green_form_valid_years'),
  '5',
  'a green form is valid 5 years by default');

select * from finish();
rollback;
