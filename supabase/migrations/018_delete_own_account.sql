-- Adds a SECURITY DEFINER RPC that permanently deletes all public.* data owned
-- by the calling authenticated user. The auth.users row itself is deleted by the
-- `delete-account` Edge Function, which holds the service role key.
--
-- Deletion order respects FK constraints:
--   1. affirmation_glows (FK → momentum_events.id + auth.users)
--   2. habit_logs        (FK → auth.users)
--   3. momentum_events   (append-only trigger; requires app.allow_momentum_purge = 'on')
--   4. habits            (FK → auth.users)
--   5. friendships       (FK → auth.users × 2)
--   6. reminders         (FK → auth.users)
--   7. profiles          (FK → auth.users — deleted last so auth.uid() still resolves)
--
-- After this RPC succeeds the Edge Function deletes the auth.users row, which
-- would cascade anyway, but all public data is already gone.

create or replace function public.delete_own_account()
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

  -- 1. Affirmation glows sent or received by this user
  delete from public.affirmation_glows
  where from_user_id = uid or to_user_id = uid;

  -- 2. Habit logs
  delete from public.habit_logs
  where user_id = uid;

  -- 3. Momentum events (append-only trigger bypass)
  perform set_config('app.allow_momentum_purge', 'on', true);
  delete from public.momentum_events
  where user_id = uid;
  perform set_config('app.allow_momentum_purge', 'off', true);

  -- 4. Habits
  delete from public.habits
  where user_id = uid;

  -- 5. Friendships (both directions)
  delete from public.friendships
  where user_id = uid or friend_id = uid;

  -- 6. Reminders
  delete from public.reminders
  where user_id = uid;

  -- 7. Profile (last — auth.uid() must still resolve)
  delete from public.profiles
  where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

notify pgrst, 'reload schema';
