-- Durable, dated protection intervals. Momentum replay checks the date of each
-- missed event against these rows instead of applying today's UI switch to history.
create table if not exists public.protection_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('exam_shield', 'vacation')),
  starts_on date not null,
  ends_on date not null,
  deactivated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists protection_windows_user_dates_idx
  on public.protection_windows (user_id, starts_on, ends_on);

alter table public.protection_windows enable row level security;

drop policy if exists protection_windows_select_own on public.protection_windows;
create policy protection_windows_select_own on public.protection_windows
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists protection_windows_insert_own on public.protection_windows;
create policy protection_windows_insert_own on public.protection_windows
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists protection_windows_update_own on public.protection_windows;
create policy protection_windows_update_own on public.protection_windows
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke delete on public.protection_windows from anon, authenticated;
grant select, insert, update on public.protection_windows to authenticated;
