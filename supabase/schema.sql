-- Append-only momentum event log.
-- Paste this into the Supabase SQL editor (or run the matching migration).
-- Every swipe inserts a new row. Historical rows are never updated or deleted.
--
-- habit_id is stored as text so UUID habit ids and legacy seed ids ('habit-1')
-- both round-trip. User-created habits use crypto.randomUUID().

create table if not exists public.momentum_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id text not null,
  event_type text not null check (event_type in ('full', 'fallback', 'missed')),
  weight double precision not null,
  "timestamp" timestamptz not null default now()
);

create index if not exists momentum_events_user_time_idx
  on public.momentum_events (user_id, "timestamp");

create index if not exists momentum_events_user_type_idx
  on public.momentum_events (user_id, event_type);

alter table public.momentum_events enable row level security;

drop policy if exists momentum_events_select_own on public.momentum_events;
create policy momentum_events_select_own
  on public.momentum_events
  for select
  using (auth.uid() = user_id);

drop policy if exists momentum_events_insert_own on public.momentum_events;
create policy momentum_events_insert_own
  on public.momentum_events
  for insert
  with check (auth.uid() = user_id);

-- No UPDATE / DELETE policies: authenticated clients cannot overwrite history.
revoke update, delete on public.momentum_events from anon, authenticated;

create or replace function public.prevent_momentum_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'momentum_events is append-only';
end;
$$;

drop trigger if exists momentum_events_no_update on public.momentum_events;
create trigger momentum_events_no_update
  before update on public.momentum_events
  for each row
  execute procedure public.prevent_momentum_events_mutation();

drop trigger if exists momentum_events_no_delete on public.momentum_events;
create trigger momentum_events_no_delete
  before delete on public.momentum_events
  for each row
  execute procedure public.prevent_momentum_events_mutation();

-- Cross-device reminder schedules (last-write-wins on updated_at).
-- Native Capacitor ids: notification_id_1 = 10 minutes prior, notification_id_2 = exact time.

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

-- Auto-confirm Auth users so a valid email + password creates a usable account.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;

create or replace function public.auto_confirm_auth_user()
returns trigger
language plpgsql
security definer
set search_path = auth
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists auto_confirm_auth_user on auth.users;
create trigger auto_confirm_auth_user
  before insert on auth.users
  for each row
  execute procedure public.auto_confirm_auth_user();

alter table if exists public.habit_logs
  add column if not exists friction_reason text;

alter table if exists public.habits
  add column if not exists is_keystone boolean not null default false;

-- Active habit cap (20). Apply supabase/migrations/007_habits_active_cap.sql.

-- Friends / peer accountability. Apply supabase/migrations/006_friends.sql
-- (public.friends + profile search + accepted-friend momentum_events reads).

