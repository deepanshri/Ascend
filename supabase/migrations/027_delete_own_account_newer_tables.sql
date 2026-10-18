-- 027: delete_own_account() — explicit deletes for tables added after 019.
--
-- momentum_history (017), protection_windows (024) and chronicle_entries (025)
-- were previously removed only by ON DELETE CASCADE from auth.users. Those
-- tables use CREATE TABLE IF NOT EXISTS, so a live table that predates its
-- migration may not carry the cascading FK. Deleting them explicitly makes
-- account deletion independent of the live FK definitions.
--
-- protection_windows may not exist (024 unapplied on some databases), so its
-- delete is guarded by to_regclass and run via EXECUTE; a static statement
-- against a missing table would fail every call with "relation does not exist".
--
-- The rest of the function body is unchanged from 019.

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

  -- 7. Momentum history snapshots
  delete from public.momentum_history
  where user_id = uid;

  -- 8. Protection windows — skipped where migration 024 has not been applied.
  if to_regclass('public.protection_windows') is not null then
    execute 'delete from public.protection_windows where user_id = $1' using uid;
  end if;

  -- 9. Chronicle entries
  delete from public.chronicle_entries
  where user_id = uid;

  -- 10. Profile
  delete from public.profiles
  where id = uid;

  -- 11. Auth identity — any remaining FK CASCADE targets are already empty.
  --     Restricted to the caller's own uid (never another user).
  delete from auth.users
  where id = uid;
end;
$$;

-- Ensure the function owner can delete from auth.users (Supabase postgres role).
alter function public.delete_own_account() owner to postgres;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

notify pgrst, 'reload schema';
