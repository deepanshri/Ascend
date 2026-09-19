-- 019: True account deletion via JWT-scoped RPC (no client service_role).
--
-- Diagnostic notes (schema):
--   profiles, friendships, habits, reminders, habit_logs, affirmation_glows,
--   and momentum_events all reference auth.users (id) ON DELETE CASCADE.
--   However, public.momentum_events has BEFORE DELETE/UPDATE triggers that
--   raise unless app.allow_momentum_purge = 'on'. A bare DELETE FROM auth.users
--   therefore fails when PostgreSQL tries to cascade into momentum_events.
--
-- This RPC:
--   1. Requires auth.uid() (authenticated JWT only).
--   2. Manually deletes dependent public.* rows for that uid (habit purge path
--      already established in 015/018) with the momentum purge session flag.
--   3. Deletes the caller's row from auth.users (SECURITY DEFINER, postgres owner).
--
-- Does NOT weaken day-to-day append-only protection: the purge flag is
-- transaction-local (set_config(..., true)) and only honored inside this
-- SECURITY DEFINER function path.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
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

  -- 3. Momentum events (append-only trigger bypass — account wipe only)
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

  -- 7. Profile
  delete from public.profiles
  where id = uid;

  -- 8. Auth identity — any remaining FK CASCADE targets are already empty.
  --    Restricted to the caller's own uid (never another user).
  delete from auth.users
  where id = uid;
end;
$$;

-- Ensure the function owner can delete from auth.users (Supabase postgres role).
alter function public.delete_own_account() owner to postgres;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

notify pgrst, 'reload schema';
