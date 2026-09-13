-- Private Affirmation Glow: who glowed which friend update.
-- No tallies, rankings, or public reaction counts.

create table if not exists public.affirmation_glows (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null,
  created_at timestamptz not null default now(),
  constraint affirmation_glows_not_self check (from_user_id <> to_user_id),
  constraint affirmation_glows_unique_sender_event unique (from_user_id, event_id)
);

create index if not exists affirmation_glows_to_user_idx
  on public.affirmation_glows (to_user_id, created_at desc);

alter table public.affirmation_glows enable row level security;

drop policy if exists affirmation_glows_select_involved on public.affirmation_glows;
create policy affirmation_glows_select_involved
  on public.affirmation_glows
  for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists affirmation_glows_insert_own_accepted on public.affirmation_glows;
create policy affirmation_glows_insert_own_accepted
  on public.affirmation_glows
  for insert
  with check (
    auth.uid() = from_user_id
    and from_user_id <> to_user_id
    and exists (
      select 1
      from public.friends f
      where f.status = 'accepted'
        and (
          (f.user_id = from_user_id and f.friend_id = to_user_id)
          or (f.friend_id = from_user_id and f.user_id = to_user_id)
        )
    )
  );

drop policy if exists affirmation_glows_delete_own on public.affirmation_glows;
create policy affirmation_glows_delete_own
  on public.affirmation_glows
  for delete
  using (auth.uid() = from_user_id);

grant select, insert, delete on public.affirmation_glows to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.affirmation_glows;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
