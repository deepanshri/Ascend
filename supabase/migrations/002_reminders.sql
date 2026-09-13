-- Cross-device reminder schedules with last-write-wins on updated_at.
-- Paste into the Supabase SQL editor (or run this migration).
-- Native Capacitor notification ids are stored so devices can cancel dual alerts.

create table if not exists public.reminders (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text,
  title text not null,
  date date not null,
  target_time time,
  days_of_week integer[] not null default '{}'::integer[],
  is_enabled boolean not null default true,
  notification_id_1 integer,
  notification_id_2 integer,
  notes text,
  completed boolean not null default false,
  deleted boolean not null default false,
  alert_10min boolean not null default true,
  alert_exact boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_days_of_week_valid check (
    days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::integer[]
  )
);

create index if not exists reminders_user_updated_idx
  on public.reminders (user_id, updated_at desc);

alter table public.reminders enable row level security;

drop policy if exists reminders_select_own on public.reminders;
create policy reminders_select_own
  on public.reminders
  for select
  using (auth.uid() = user_id);

drop policy if exists reminders_insert_own on public.reminders;
create policy reminders_insert_own
  on public.reminders
  for insert
  with check (auth.uid() = user_id);

drop policy if exists reminders_update_own on public.reminders;
create policy reminders_update_own
  on public.reminders
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists reminders_delete_own on public.reminders;
create policy reminders_delete_own
  on public.reminders
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.reminders to authenticated;
