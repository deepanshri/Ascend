-- Allow owner cascade purge of momentum_events when deleting a habit.
-- Keeps append-only protection for normal clients; SECURITY DEFINER RPC
-- sets a session flag the mutation trigger honors.

create or replace function public.prevent_momentum_events_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_momentum_purge', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception 'momentum_events is append-only';
end;
$$;

create or replace function public.delete_habit_cascade(p_habit_id text)
returns void
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
  if p_habit_id is null or length(trim(p_habit_id)) = 0 then
    raise exception 'habit id required';
  end if;

  -- Drop glows aimed at this habit's events first (FK / orphan cleanup).
  delete from public.affirmation_glows
  where event_id in (
    select id
    from public.momentum_events
    where user_id = uid
      and habit_id = p_habit_id
  );

  delete from public.habit_logs
  where user_id = uid
    and habit_id = p_habit_id;

  perform set_config('app.allow_momentum_purge', 'on', true);
  delete from public.momentum_events
  where user_id = uid
    and habit_id = p_habit_id;
  perform set_config('app.allow_momentum_purge', 'off', true);

  delete from public.habits
  where user_id = uid
    and id::text = p_habit_id;
end;
$$;

revoke all on function public.delete_habit_cascade(text) from public;
grant execute on function public.delete_habit_cascade(text) to authenticated;

notify pgrst, 'reload schema';
