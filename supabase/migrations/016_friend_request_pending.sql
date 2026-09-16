-- Friend code connect creates a pending request; recipient must Accept.
-- Reciprocal pending auto-accepts into a bidirectional accepted friendship.

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
  existing_out public.friendships%rowtype;
  existing_in public.friendships%rowtype;
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

  select * into existing_out
  from public.friendships
  where user_id = me and friend_id = peer_id
  limit 1;

  select * into existing_in
  from public.friendships
  where user_id = peer_id and friend_id = me
  limit 1;

  if (existing_out.status = 'accepted') or (existing_in.status = 'accepted') then
    -- Ensure both directions are accepted.
    insert into public.friendships (user_id, friend_id, status)
    values (me, peer_id, 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
    insert into public.friendships (user_id, friend_id, status)
    values (peer_id, me, 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
    return jsonb_build_object('ok', true, 'message', 'Already connected.', 'peer_id', peer_id, 'peer_name', peer_label);
  end if;

  -- Peer already invited me → accept both ways.
  if existing_in.status = 'pending' then
    update public.friendships set status = 'accepted' where id = existing_in.id;
    insert into public.friendships (user_id, friend_id, status)
    values (me, peer_id, 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
    return jsonb_build_object(
      'ok', true,
      'message', 'Friend request accepted.',
      'peer_id', peer_id,
      'peer_name', peer_label
    );
  end if;

  if existing_out.status = 'pending' then
    return jsonb_build_object('ok', true, 'message', 'Request already sent.', 'peer_id', peer_id, 'peer_name', peer_label);
  end if;

  insert into public.friendships (user_id, friend_id, status)
  values (me, peer_id, 'pending')
  on conflict (user_id, friend_id) do update set status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'message', 'Friend request sent.',
    'peer_id', peer_id,
    'peer_name', peer_label
  );
end;
$$;

revoke all on function public.connect_by_friend_code(text) from public;
grant execute on function public.connect_by_friend_code(text) to authenticated;

notify pgrst, 'reload schema';
