-- Peer accountability: directed friend requests + accepted-only activity reads.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  interests jsonb default '[]'::jsonb,
  has_completed_tutorial boolean not null default false,
  username text,
  email text,
  display_name text,
  updated_at timestamptz default now()
);

alter table if exists public.profiles
  add column if not exists username text,
  add column if not exists email text,
  add column if not exists display_name text;

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null and length(trim(username)) > 0;

create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friends_not_self check (user_id <> friend_id)
);

create unique index if not exists friends_directed_pair_idx
  on public.friends (user_id, friend_id);

create unique index if not exists friends_undirected_pair_idx
  on public.friends (least(user_id, friend_id), greatest(user_id, friend_id));

create index if not exists friends_friend_status_idx
  on public.friends (friend_id, status);

alter table public.friends enable row level security;
alter table if exists public.profiles enable row level security;

drop policy if exists friends_select_involved on public.friends;
create policy friends_select_involved
  on public.friends
  for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists friends_insert_own on public.friends;
create policy friends_insert_own
  on public.friends
  for insert
  with check (auth.uid() = user_id and user_id <> friend_id);

drop policy if exists friends_update_involved on public.friends;
create policy friends_update_involved
  on public.friends
  for update
  using (auth.uid() = user_id or auth.uid() = friend_id)
  with check (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists friends_delete_involved on public.friends;
create policy friends_delete_involved
  on public.friends
  for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

grant select, insert, update, delete on public.friends to authenticated;

drop policy if exists profiles_select_self_friends_pending on public.profiles;
create policy profiles_select_self_friends_pending
  on public.profiles
  for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.friends f
      where (
          (f.status = 'accepted' and (
            (f.user_id = auth.uid() and f.friend_id = profiles.id)
            or (f.friend_id = auth.uid() and f.user_id = profiles.id)
          ))
          or (f.status = 'pending' and (
            (f.friend_id = auth.uid() and f.user_id = profiles.id)
            or (f.user_id = auth.uid() and f.friend_id = profiles.id)
          ))
        )
    )
  );

drop policy if exists profiles_upsert_own on public.profiles;
create policy profiles_upsert_own
  on public.profiles
  for insert
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.search_profiles(query text)
returns table (
  id uuid,
  username text,
  email text,
  display_name text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.username, p.email, p.display_name
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(trim(query)) >= 2
    and (
      p.username ilike '%' || trim(query) || '%'
      or p.email ilike '%' || trim(query) || '%'
      or p.display_name ilike '%' || trim(query) || '%'
    )
  order by p.display_name nulls last, p.username nulls last
  limit 12;
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

drop policy if exists momentum_events_select_friends on public.momentum_events;
create policy momentum_events_select_friends
  on public.momentum_events
  for select
  using (
    exists (
      select 1
      from public.friends f
      where f.status = 'accepted'
        and (
          (f.user_id = auth.uid() and f.friend_id = momentum_events.user_id)
          or (f.friend_id = auth.uid() and f.user_id = momentum_events.user_id)
        )
    )
  );

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'habits'
  ) then
    execute 'drop policy if exists habits_select_accepted_friends on public.habits';
    execute $p$
      create policy habits_select_accepted_friends
        on public.habits
        for select
        using (
          exists (
            select 1
            from public.friends f
            where f.status = 'accepted'
              and (
                (f.user_id = auth.uid() and f.friend_id = habits.user_id)
                or (f.friend_id = auth.uid() and f.user_id = habits.user_id)
              )
          )
        )
    $p$;
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friends;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.momentum_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
