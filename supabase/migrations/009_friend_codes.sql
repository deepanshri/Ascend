-- Persistent 6-character friend codes on profiles + instant mutual connect.
-- Keeps public.friends (user_id, friend_id, status). Does not drop that table.

alter table if exists public.profiles
  add column if not exists friend_code text;

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

do $$
declare
  r record;
  code text;
  n int;
begin
  for r in select id from public.profiles where friend_code is null or length(trim(friend_code)) <> 6 loop
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

drop function if exists public.connect_by_friend_code(text);

create function public.connect_by_friend_code(input_code text)
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
  already boolean;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in to connect.');
  end if;

  normalized := upper(regexp_replace(coalesce(input_code, ''), '[^0-9A-Za-z]', '', 'g'));
  normalized := regexp_replace(normalized, '[O]', '0', 'g');
  normalized := regexp_replace(normalized, '[I]', '1', 'g');
  normalized := regexp_replace(normalized, '[01]', '', 'g');

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

  select exists (
    select 1
    from public.friends f
    where (f.user_id = me and f.friend_id = peer_id)
       or (f.friend_id = me and f.user_id = peer_id)
  ) into already;

  if already then
    update public.friends
    set status = 'accepted'
    where ((user_id = me and friend_id = peer_id) or (friend_id = me and user_id = peer_id))
      and status is distinct from 'accepted';
    return jsonb_build_object('ok', true, 'message', 'Already connected.', 'peer_id', peer_id, 'peer_name', peer_label);
  end if;

  insert into public.friends (user_id, friend_id, status)
  values (me, peer_id, 'accepted');

  return jsonb_build_object('ok', true, 'message', 'You are now friends.', 'peer_id', peer_id, 'peer_name', peer_label);
exception
  when unique_violation then
    update public.friends
    set status = 'accepted'
    where (user_id = me and friend_id = peer_id) or (friend_id = me and user_id = peer_id);
    return jsonb_build_object('ok', true, 'message', 'You are now friends.', 'peer_id', peer_id, 'peer_name', peer_label);
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

revoke all on function public.connect_by_friend_code(text) from public;
grant execute on function public.connect_by_friend_code(text) to authenticated;
