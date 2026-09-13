-- Append-only momentum event log.
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
