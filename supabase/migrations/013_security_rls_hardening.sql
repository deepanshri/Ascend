-- C4: Drop dashboard FOR ALL policy that allowed INSERT as friend_id.
-- D4: Commit live owner RLS (Habits/Logs self access) so db reset matches production.
-- Version 013: live schema_migrations uses the numeric prefix as primary key,
-- so this cannot share 012 with purge_integrity_test_accounts.

-- ---------------------------------------------------------------------------
-- public.friendships — split policies, no ALL
-- ---------------------------------------------------------------------------
drop policy if exists "Friendships self access" on public.friendships;
drop policy if exists friendships_self_access on public.friendships;
drop policy if exists friendships_select_involved on public.friendships;
drop policy if exists friendships_insert_own on public.friendships;
drop policy if exists friendships_update_involved on public.friendships;
drop policy if exists friendships_delete_involved on public.friendships;

alter table public.friendships enable row level security;

create policy friendships_select_involved
  on public.friendships
  for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Initiate only as user_id. Reciprocal accepted rows are written by
-- connect_by_friend_code (SECURITY DEFINER), which bypasses this INSERT policy.
create policy friendships_insert_own
  on public.friendships
  for insert
  with check (auth.uid() = user_id and user_id <> friend_id);

create policy friendships_update_involved
  on public.friendships
  for update
  using (auth.uid() = user_id or auth.uid() = friend_id)
  with check (auth.uid() = user_id or auth.uid() = friend_id);

create policy friendships_delete_involved
  on public.friendships
  for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

grant select, insert, update, delete on public.friendships to authenticated;

-- ---------------------------------------------------------------------------
-- Owner RLS previously created only in the dashboard
-- ---------------------------------------------------------------------------
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists "Habits self access" on public.habits;
create policy "Habits self access"
  on public.habits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Logs self access" on public.habit_logs;
create policy "Logs self access"
  on public.habit_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
