-- Migration 028: Help & Feedback reports.
--
-- Signed-in users insert their own reports and can read back only their own.
-- No one can update or delete a report through the API; read everyone's
-- reports from the dashboard or with the service role, which bypasses RLS.
-- The client generates the id, so a retried upload from the offline queue
-- (insert ... on conflict (id) do nothing) never creates a duplicate.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  app_version text check (app_version is null or char_length(app_version) <= 64),
  platform text check (platform is null or platform in ('android', 'ios', 'web')),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  -- When the user pressed Submit (device clock); may be well before received_at if it was queued offline.
  created_at timestamptz not null default now(),
  -- When the server stored it.
  received_at timestamptz not null default now()
);

create index if not exists feedback_received_at_idx
  on public.feedback (received_at desc);

create index if not exists feedback_user_created_idx
  on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own
  on public.feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own
  on public.feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;

notify pgrst, 'reload schema';
