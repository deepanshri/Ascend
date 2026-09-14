-- Run after 011/012 against the linked project.

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('habits', 'habit_logs', 'profiles', 'friendships', 'friends', 'affirmation_glows', 'momentum_events')
order by table_name, ordinal_position;

select r.routine_name, p.parameter_name, p.data_type
from information_schema.routines r
join information_schema.parameters p
  on r.specific_schema = p.specific_schema
 and r.specific_name = p.specific_name
where r.routine_schema = 'public'
  and r.routine_name = 'connect_by_friend_code'
order by p.ordinal_position;

select
  (select count(*) from auth.users where email ilike 'ascend.integrity.%') as integrity_auth_users,
  (select count(*) from public.profiles where email ilike 'ascend.integrity.%') as integrity_profiles,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'friends') as friends_table,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'friendships') as friendships_table;
