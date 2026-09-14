-- Live DB (dpgupbcbhkmjtyqkljpr) reconciliation: make public schema match
-- the repo's intended client payloads. Canonical social table is public.friendships.

-- ---------------------------------------------------------------------------
-- public.habits
-- ---------------------------------------------------------------------------
alter table if exists public.habits
  add column if not exists identity_statement text,
  add column if not exists archived boolean not null default false,
  add column if not exists name text,
  add column if not exists "timestamp" text,
  add column if not exists days boolean[],
  add column if not exists micro_days boolean[],
  add column if not exists fallback_micro_habit text,
  add column if not exists target_days_per_week integer,
  add column if not exists color text,
  add column if not exists tags text[],
  add column if not exists priority text,
  add column if not exists schedule_type text,
  add column if not exists scheduled_days integer[],
  add column if not exists interval_days integer,
  add column if not exists weekly_target_count integer,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.habits
  add column if not exists is_archived boolean not null default false,
  add column if not exists is_keystone boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'habits' and column_name = 'purpose_anchor'
  ) then
    execute 'alter table public.habits alter column purpose_anchor drop not null';
  end if;
end $$;

update public.habits
set name = title
where name is null and title is not null;

update public.habits
set archived = coalesce(is_archived, false)
where archived is distinct from coalesce(is_archived, false);

create or replace function public.sync_habit_client_columns()
returns trigger
language plpgsql
as $$
begin
  new.title := coalesce(nullif(trim(coalesce(new.title, '')), ''), new.name, new.title);
  new.name := coalesce(nullif(trim(coalesce(new.name, '')), ''), new.title, new.name);
  new.archived := coalesce(new.archived, new.is_archived, false);
  new.is_archived := coalesce(new.is_archived, new.archived, false);
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

drop trigger if exists habits_sync_client_columns on public.habits;
create trigger habits_sync_client_columns
  before insert or update on public.habits
  for each row
  execute procedure public.sync_habit_client_columns();

create or replace function public.enforce_active_habit_cap()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if coalesce(new.archived, new.is_archived, false) then
    return new;
  end if;

  select count(*)
    into active_count
  from public.habits
  where user_id = new.user_id
    and coalesce(archived, is_archived, false) = false
    and id is distinct from new.id;

  if active_count >= 20 then
    raise exception 'Maximum limit of 20 active habits reached.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists habits_active_cap on public.habits;
create trigger habits_active_cap
  before insert or update on public.habits
  for each row
  execute procedure public.enforce_active_habit_cap();

-- ---------------------------------------------------------------------------
-- public.habit_logs — support both live completion_type and client payloads
-- ---------------------------------------------------------------------------
alter table if exists public.habit_logs
  add column if not exists date text,
  add column if not exists type text,
  add column if not exists completion double precision,
  add column if not exists value double precision,
  add column if not exists day_index integer,
  add column if not exists note text,
  add column if not exists "timestamp" bigint,
  add column if not exists friction_reason text,
  add column if not exists logged_date date,
  add column if not exists completion_type text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'habit_logs'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    execute 'alter table public.habit_logs alter column id drop default';
    execute 'alter table public.habit_logs alter column id type text using id::text';
    execute 'alter table public.habit_logs alter column id set default gen_random_uuid()::text';
  end if;
end $$;

do $$
declare
  fkey text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'habit_logs'
      and column_name = 'habit_id'
      and data_type = 'uuid'
  ) then
    for fkey in
      select conname from pg_constraint
      where conrelid = 'public.habit_logs'::regclass and contype = 'f'
    loop
      execute format('alter table public.habit_logs drop constraint if exists %I', fkey);
    end loop;
    execute 'alter table public.habit_logs alter column habit_id type text using habit_id::text';
  end if;
end $$;

create or replace function public.sync_habit_log_client_columns()
returns trigger
language plpgsql
as $$
begin
  if new.logged_date is null and new.date is not null then
    begin
      new.logged_date := new.date::date;
    exception
      when others then null;
    end;
  end if;
  if new.date is null and new.logged_date is not null then
    new.date := new.logged_date::text;
  end if;

  if new.completion is null and new.value is not null then
    new.completion := new.value;
  end if;
  if new.value is null and new.completion is not null then
    new.value := new.completion;
  end if;

  if new.type is null and new.completion_type is not null then
    new.type := case
      when new.completion_type in ('fallback', 'fallback_micro') then 'fallback_micro'
      when new.completion_type = 'missed' then 'missed'
      else 'full'
    end;
  end if;
  if new.completion_type is null and new.type is not null then
    new.completion_type := case
      when new.type in ('fallback', 'fallback_micro') then 'fallback'
      when new.type = 'missed' then 'missed'
      else 'full'
    end;
  end if;

  if new.completion_type is null and new.completion is not null then
    new.completion_type := case
      when new.completion <= 0 then 'missed'
      when new.completion < 1 then 'fallback'
      else 'full'
    end;
  end if;

  if new."timestamp" is null then
    new."timestamp" := (extract(epoch from now()) * 1000)::bigint;
  end if;
  return new;
end;
$$;

drop trigger if exists habit_logs_sync_client_columns on public.habit_logs;
create trigger habit_logs_sync_client_columns
  before insert or update on public.habit_logs
  for each row
  execute procedure public.sync_habit_log_client_columns();

delete from public.habit_logs a
using public.habit_logs b
where a.ctid < b.ctid
  and a.habit_id = b.habit_id
  and a.logged_date is not distinct from b.logged_date
  and a.logged_date is not null;

create unique index if not exists habit_logs_habit_id_logged_date_key
  on public.habit_logs (habit_id, logged_date);

-- ---------------------------------------------------------------------------
-- public.profiles
-- ---------------------------------------------------------------------------
alter table if exists public.profiles
  add column if not exists username text,
  add column if not exists friend_code varchar(6),
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists vacation boolean not null default false,
  add column if not exists exam_shield boolean not null default false,
  add column if not exists interests jsonb default '[]'::jsonb,
  add column if not exists has_completed_tutorial boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'friend_code'
      and data_type = 'text'
  ) then
    execute $sql$
      alter table public.profiles
        alter column friend_code type varchar(6)
        using left(friend_code, 6)
    $sql$;
  end if;
end $$;

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null and length(trim(username)) > 0;

create unique index if not exists profiles_friend_code_idx
  on public.profiles (friend_code)
  where friend_code is not null;

create or replace function public.generate_friend_code_from_seed(seed text)
returns text
language plpgsql
immutable
as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  h numeric;
  code text := '';
  i int;
begin
  h := abs(('x' || substr(md5(coalesce(seed, '')), 1, 15))::bit(60)::bigint);
  for i in 1..6 loop
    code := code || substr(alphabet, (mod(h, 32))::int + 1, 1);
    h := trunc(h / 32);
  end loop;
  return code;
end;
$$;

create or replace function public.profiles_set_friend_code()
returns trigger
language plpgsql
as $$
declare
  n int := 0;
  code text;
begin
  if new.friend_code is not null and length(trim(new.friend_code)) = 6 then
    new.friend_code := upper(new.friend_code);
    return new;
  end if;
  loop
    code := public.generate_friend_code_from_seed(new.id::text || ':' || n::text);
    exit when not exists (
      select 1 from public.profiles p
      where p.friend_code = code and p.id is distinct from new.id
    );
    n := n + 1;
  end loop;
  new.friend_code := code;
  return new;
end;
$$;

drop trigger if exists profiles_set_friend_code on public.profiles;
create trigger profiles_set_friend_code
  before insert or update of friend_code
  on public.profiles
  for each row
  execute procedure public.profiles_set_friend_code();

do $$
declare
  r record;
  code text;
  n int;
begin
  for r in
    select id from public.profiles
    where friend_code is null or length(trim(friend_code)) <> 6
  loop
    n := 0;
    loop
      code := public.generate_friend_code_from_seed(r.id::text || ':' || n::text);
      exit when not exists (
        select 1 from public.profiles p where p.friend_code = code and p.id <> r.id
      );
      n := n + 1;
    end loop;
    update public.profiles set friend_code = code where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- public.friendships (canonical). Migrate leftover public.friends if present.
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friendships_not_self check (user_id <> friend_id)
);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'friends'
  ) then
    insert into public.friendships (id, user_id, friend_id, status, created_at)
    select id, user_id, friend_id, status, created_at
    from public.friends
    on conflict (id) do nothing;
  end if;
exception
  when undefined_table then null;
end $$;

delete from public.friendships a
using public.friendships b
where a.ctid < b.ctid
  and a.user_id = b.user_id
  and a.friend_id = b.friend_id;

do $$
declare
  r record;
begin
  for r in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename in ('friendships', 'friends')
      and (indexdef ilike '%least(%' or indexdef ilike '%greatest(%')
  loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end $$;

create or replace function public.is_accepted_friendship(a uuid, b uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_id = a and f.friend_id = b)
        or (f.user_id = b and f.friend_id = a)
      )
  );
$$;

grant execute on function public.is_accepted_friendship(uuid, uuid) to authenticated;

create unique index if not exists friendships_directed_pair_idx
  on public.friendships (user_id, friend_id);

create index if not exists friendships_friend_status_idx
  on public.friendships (friend_id, status);

alter table public.friendships enable row level security;

drop policy if exists friendships_select_involved on public.friendships;
create policy friendships_select_involved
  on public.friendships
  for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists friendships_insert_own on public.friendships;
create policy friendships_insert_own
  on public.friendships
  for insert
  with check (auth.uid() = user_id and user_id <> friend_id);

drop policy if exists friendships_update_involved on public.friendships;
create policy friendships_update_involved
  on public.friendships
  for update
  using (auth.uid() = user_id or auth.uid() = friend_id)
  with check (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists friendships_delete_involved on public.friendships;
create policy friendships_delete_involved
  on public.friendships
  for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

grant select, insert, update, delete on public.friendships to authenticated;

drop policy if exists profiles_select_self_friends_pending on public.profiles;
drop policy if exists profiles_select_self_friendships on public.profiles;
create policy profiles_select_self_friendships
  on public.profiles
  for select
  using (
    id = auth.uid()
    or public.is_accepted_friendship(auth.uid(), id)
    or exists (
      select 1
      from public.friendships f
      where f.status = 'pending'
        and (
          (f.friend_id = auth.uid() and f.user_id = profiles.id)
          or (f.user_id = auth.uid() and f.friend_id = profiles.id)
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

drop policy if exists momentum_events_select_friends on public.momentum_events;
drop policy if exists momentum_events_select_friendships on public.momentum_events;
create policy momentum_events_select_friendships
  on public.momentum_events
  for select
  using (public.is_accepted_friendship(auth.uid(), momentum_events.user_id));

drop policy if exists habits_select_accepted_friends on public.habits;
drop policy if exists habits_select_accepted_friendships on public.habits;
create policy habits_select_accepted_friendships
  on public.habits
  for select
  using (public.is_accepted_friendship(auth.uid(), habits.user_id));

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'friends'
  ) then
    execute 'drop table public.friends cascade';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- connect_by_friend_code(target_code text) — bidirectional friendships insert
-- ---------------------------------------------------------------------------
drop function if exists public.connect_by_friend_code(text);

create function public.connect_by_friend_code(target_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  normalized text;
  peer_id uuid;
  peer_label text;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to connect.');
  end if;

  normalized := upper(regexp_replace(coalesce(target_code, ''), '[^0-9A-Za-z]', '', 'g'));
  if length(normalized) <> 6 then
    return jsonb_build_object('ok', false, 'message', 'Enter a 6-character friend code.');
  end if;

  select p.id, coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Friend')
    into peer_id, peer_label
  from public.profiles p
  where p.friend_code = normalized
  limit 1;

  if peer_id is null then
    return jsonb_build_object('ok', false, 'message', 'No profile uses that code.');
  end if;

  if peer_id = me then
    return jsonb_build_object('ok', false, 'message', 'You cannot connect with your own code.');
  end if;

  insert into public.friendships (user_id, friend_id, status)
  values (me, peer_id, 'accepted')
  on conflict (user_id, friend_id) do update
    set status = 'accepted';

  insert into public.friendships (user_id, friend_id, status)
  values (peer_id, me, 'accepted')
  on conflict (user_id, friend_id) do update
    set status = 'accepted';

  return jsonb_build_object(
    'ok', true,
    'message', 'You are now friends.',
    'peer_id', peer_id,
    'peer_name', peer_label
  );
exception
  when unique_violation then
    update public.friendships
    set status = 'accepted'
    where (user_id = me and friend_id = peer_id)
       or (user_id = peer_id and friend_id = me);
    return jsonb_build_object('ok', true, 'message', 'You are now friends.', 'peer_id', peer_id, 'peer_name', peer_label);
end;
$$;

revoke all on function public.connect_by_friend_code(text) from public;
grant execute on function public.connect_by_friend_code(text) to authenticated;

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

-- ---------------------------------------------------------------------------
-- public.affirmation_glows (includes nullable note)
-- ---------------------------------------------------------------------------
create table if not exists public.affirmation_glows (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint affirmation_glows_not_self check (from_user_id <> to_user_id),
  constraint affirmation_glows_unique_sender_event unique (from_user_id, event_id)
);

alter table public.affirmation_glows
  add column if not exists note text;

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
    and public.is_accepted_friendship(from_user_id, to_user_id)
  );

drop policy if exists affirmation_glows_delete_own on public.affirmation_glows;
create policy affirmation_glows_delete_own
  on public.affirmation_glows
  for delete
  using (auth.uid() = from_user_id);

grant select, insert, delete on public.affirmation_glows to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.friendships;
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

do $$
begin
  alter publication supabase_realtime add table public.affirmation_glows;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ON CONFLICT (user_id, friend_id) requires a unique constraint, not only an index.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.friendships'::regclass
      and conname = 'friendships_user_friend_key'
  ) then
    alter table public.friendships
      add constraint friendships_user_friend_key unique (user_id, friend_id);
  end if;
exception
  when duplicate_object then null;
  when unique_violation then null;
end $$;

notify pgrst, 'reload schema';
