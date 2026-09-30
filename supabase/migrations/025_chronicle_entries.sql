-- Migration 025: Chronicle entries table for 3-phase intentional journaling
create table if not exists public.chronicle_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  iso_date date not null,
  phase1 text not null default '',
  phase2 text not null default '',
  phase3 text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chronicle_entries_user_iso_unique unique (user_id, iso_date)
);

create index if not exists chronicle_entries_user_date_idx
  on public.chronicle_entries (user_id, iso_date desc);

alter table public.chronicle_entries enable row level security;

drop policy if exists chronicle_entries_select_own on public.chronicle_entries;
create policy chronicle_entries_select_own
  on public.chronicle_entries
  for select
  using (auth.uid() = user_id);

drop policy if exists chronicle_entries_insert_own on public.chronicle_entries;
create policy chronicle_entries_insert_own
  on public.chronicle_entries
  for insert
  with check (auth.uid() = user_id);

drop policy if exists chronicle_entries_update_own on public.chronicle_entries;
create policy chronicle_entries_update_own
  on public.chronicle_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists chronicle_entries_delete_own on public.chronicle_entries;
create policy chronicle_entries_delete_own
  on public.chronicle_entries
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.chronicle_entries to authenticated;
