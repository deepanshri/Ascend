-- 023_security_hardening_findings_1_to_4.sql
-- Security Hardening for Findings 1 to 4:
-- 1. Restrict friendships direct insert to status = 'pending', updates to recipient only,
--    prevent user_id/friend_id modification on update, and add secure respond_to_friend_request RPC.
-- 2. Drop email column from search_profiles RPC return table and query matching.
-- 3. Drop friend select policy on public.habits (owner only) and provide secure RPCs for
--    friend active habit IDs and identity summaries (strictly never exposing purpose_anchor or titles).
-- 4. Enforce profiles.email authenticity via trigger syncing from auth.users.email.

-- ===========================================================================
-- Finding 1: public.friendships Authorization & RLS Hardening
-- ===========================================================================

-- 1. Drop overly permissive friendships policies
DROP POLICY IF EXISTS friendships_insert_own ON public.friendships;
DROP POLICY IF EXISTS friendships_update_involved ON public.friendships;
DROP POLICY IF EXISTS friendships_update_recipient ON public.friendships;

-- 2. Direct INSERT: must be caller's user_id, cannot self-friend, and MUST be pending.
--    Accepted status is strictly forbidden on direct insert.
CREATE POLICY friendships_insert_own
  ON public.friendships
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND user_id <> friend_id
    AND status = 'pending'
  );

-- 3. Direct UPDATE: ONLY the recipient (friend_id) can update a pending request to accepted.
--    The sender cannot accept their own request.
CREATE POLICY friendships_update_recipient
  ON public.friendships
  FOR UPDATE
  USING (
    auth.uid() = friend_id
    AND status = 'pending'
  )
  WITH CHECK (
    auth.uid() = friend_id
    AND status = 'accepted'
  );

-- 4. Invariant: Prevent modifying user_id or friend_id on existing friendships
CREATE OR REPLACE FUNCTION public.prevent_friendship_endpoint_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.friend_id IS DISTINCT FROM OLD.friend_id THEN
    RAISE EXCEPTION 'Cannot modify user_id or friend_id on an existing friendship';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_prevent_endpoint_mutation ON public.friendships;
CREATE TRIGGER friendships_prevent_endpoint_mutation
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_friendship_endpoint_mutation();

-- 5. Secure RPC for responding to friend requests:
--    Verifies recipient identity, asserts request is pending, and handles reciprocal
--    accepted edge insertion atomically under SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(edge_id uuid, new_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  target public.friendships%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sign in to respond to friend requests.');
  END IF;

  SELECT * INTO target
  FROM public.friendships
  WHERE id = edge_id;

  IF target.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Friend request not found.');
  END IF;

  -- Only the recipient of the pending request can accept or decline
  IF target.friend_id <> me THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Only the request recipient can accept or decline.');
  END IF;

  -- Assert that the request is currently in pending state
  IF target.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Friend request is not pending.');
  END IF;

  IF new_status = 'declined' THEN
    DELETE FROM public.friendships WHERE id = edge_id;
    RETURN jsonb_build_object('ok', true, 'message', 'Friend request declined.');
  ELSIF new_status = 'accepted' THEN
    -- Mark incoming request accepted
    UPDATE public.friendships
    SET status = 'accepted'
    WHERE id = edge_id;

    -- Ensure reciprocal edge exists and is marked accepted
    INSERT INTO public.friendships (user_id, friend_id, status)
    VALUES (me, target.user_id, 'accepted')
    ON CONFLICT (user_id, friend_id) DO UPDATE
      SET status = 'accepted';

    RETURN jsonb_build_object('ok', true, 'message', 'Friend request accepted.');
  ELSE
    RETURN jsonb_build_object('ok', false, 'message', 'Invalid status. Expected accepted or declined.');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, text) TO authenticated;


-- ===========================================================================
-- Finding 2: Strip Email from public.search_profiles(query text)
-- ===========================================================================

DROP FUNCTION IF EXISTS public.search_profiles(text);

CREATE OR REPLACE FUNCTION public.search_profiles(query text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND length(trim(query)) >= 2
    AND (
      p.username ILIKE '%' || trim(query) || '%'
      OR p.display_name ILIKE '%' || trim(query) || '%'
    )
  ORDER BY p.display_name NULLS LAST, p.username NULLS LAST
  LIMIT 12;
$$;

REVOKE ALL ON FUNCTION public.search_profiles(text) FROM public;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;


-- ===========================================================================
-- Finding 3: Restrict public.habits to Owner Only & Provide Safe RPCs for Friends
-- ===========================================================================

-- 1. Drop friend read access on public.habits entirely.
--    Habits self access (auth.uid() = user_id) remains the only policy.
DROP POLICY IF EXISTS habits_select_accepted_friends ON public.habits;
DROP POLICY IF EXISTS habits_select_accepted_friendships ON public.habits;

-- 2. Provide a restricted RPC to load active habit IDs for friend milestone counts.
--    Never returns titles, schedules, identity statements, or purpose anchors.
CREATE OR REPLACE FUNCTION public.get_friend_active_habit_ids(friend_ids uuid[])
RETURNS TABLE (id text, user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id::text, h.user_id
  FROM public.habits h
  WHERE h.user_id = ANY(friend_ids)
    AND COALESCE(h.archived, h.is_archived, false) = false
    AND public.is_accepted_friendship(auth.uid(), h.user_id);
$$;

REVOKE ALL ON FUNCTION public.get_friend_active_habit_ids(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_friend_active_habit_ids(uuid[]) TO authenticated;

-- 3. Provide a restricted RPC for the Reports Friend Identity Ledger.
--    Returns ONLY the identity statement and active habit count.
--    Never returns individual habit names, schedules, or purpose anchors.
CREATE OR REPLACE FUNCTION public.get_friend_identity_summary(p_friend_id uuid)
RETURNS TABLE (identity_statement text, active_habit_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  is_friend boolean;
  stmt text;
  cnt integer;
BEGIN
  is_friend := public.is_accepted_friendship(auth.uid(), p_friend_id);
  IF NOT is_friend THEN
    RETURN;
  END IF;

  SELECT count(*) INTO cnt
  FROM public.habits h
  WHERE h.user_id = p_friend_id
    AND COALESCE(h.archived, h.is_archived, false) = false;

  SELECT COALESCE(
    NULLIF(TRIM(h_keystone.identity_statement), ''),
    NULLIF(TRIM(h_any.identity_statement), ''),
    'Building consistency, one vote at a time.'
  ) INTO stmt
  FROM (SELECT 1) _
  LEFT JOIN LATERAL (
    SELECT h1.identity_statement FROM public.habits h1
    WHERE h1.user_id = p_friend_id AND h1.is_keystone = true AND COALESCE(h1.archived, h1.is_archived, false) = false
      AND length(trim(coalesce(h1.identity_statement, ''))) > 0
    LIMIT 1
  ) h_keystone ON true
  LEFT JOIN LATERAL (
    SELECT h2.identity_statement FROM public.habits h2
    WHERE h2.user_id = p_friend_id AND COALESCE(h2.archived, h2.is_archived, false) = false
      AND length(trim(coalesce(h2.identity_statement, ''))) > 0
    LIMIT 1
  ) h_any ON true;

  identity_statement := COALESCE(stmt, 'Building consistency, one vote at a time.');
  active_habit_count := COALESCE(cnt, 0);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_identity_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_friend_identity_summary(uuid) TO authenticated;


-- ===========================================================================
-- Finding 4: Enforce Authentic Email on public.profiles via Auth Users Trigger
-- ===========================================================================

-- 1. Trigger function that syncs real email from auth.users on insert or update.
CREATE OR REPLACE FUNCTION public.sync_profile_auth_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  real_email text;
BEGIN
  SELECT email INTO real_email FROM auth.users WHERE id = NEW.id;
  NEW.email := real_email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_auth_email ON public.profiles;
CREATE TRIGGER profiles_sync_auth_email
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_profile_auth_email();

-- 2. One-time backfill aligning any mismatched profile emails with auth.users.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS DISTINCT FROM u.email);

-- 3. Restrict direct SELECT on public.profiles to the owner only (auth.uid() = id).
--    This prevents pending requesters or third parties from reading another user's email.
DROP POLICY IF EXISTS profiles_select_self_friendships ON public.profiles;
DROP POLICY IF EXISTS profiles_select_self_friends_pending ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 4. Secure RPC to fetch public profile directory info (display name, username, avatar)
--    for friends and pending requesters without exposing email or private fields.
CREATE OR REPLACE FUNCTION public.get_profiles_lite(profile_ids uuid[])
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(profile_ids)
    AND (
      p.id = auth.uid()
      OR public.is_accepted_friendship(auth.uid(), p.id)
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'pending'
          AND (
            (f.friend_id = auth.uid() AND f.user_id = p.id)
            OR (f.user_id = auth.uid() AND f.friend_id = p.id)
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_profiles_lite(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_profiles_lite(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
