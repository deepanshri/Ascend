-- Bulk counterpart to delete_habit_cascade (015): removes every habit owned by
-- the caller in one transaction, together with the glows, habit_logs and
-- momentum_events that reference them, and returns the deleted habit ids.
-- habit_id columns are TEXT with no FK to habits, so a plain habits delete
-- would leave those rows orphaned.

create or replace function public.delete_all_habits_cascade()
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.affirmation_glows
  where event_id in (
    select id
    from public.momentum_events
    where user_id = uid
      and habit_id in (select id::text from public.habits where user_id = uid)
  );

  delete from public.habit_logs
  where user_id = uid
    and habit_id in (select id::text from public.habits where user_id = uid);

  perform set_config('app.allow_momentum_purge', 'on', true);
  delete from public.momentum_events
  where user_id = uid
    and habit_id in (select id::text from public.habits where user_id = uid);
  perform set_config('app.allow_momentum_purge', 'off', true);

  return query
    delete from public.habits
    where user_id = uid
    returning id::text;
end;
$$;

revoke all on function public.delete_all_habits_cascade() from public;
grant execute on function public.delete_all_habits_cascade() to authenticated;

notify pgrst, 'reload schema';
