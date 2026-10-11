import { generateFriendCode, isValidFriendCode, normalizeFriendCode } from '../utils/friendCode';
import { resolveAvatarId } from '../data/avatars';
import { toISODate } from '../utils/dates';
import { isSupabaseConfigured, supabase } from './supabase';

/** Canonical social graph. Live DB and client queries both use public.friendships. */
export const FRIENDSHIPS_TABLE = 'friendships';

export type FriendStatus = 'pending' | 'accepted';

export interface FriendEdge {
  id: string;
  userId: string;
  friendId: string;
  status: FriendStatus;
  createdAt: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string | null;
}

function canUse(userId?: string | null): boolean {
  return Boolean(isSupabaseConfigured && supabase && userId && !userId.startsWith('guest_'));
}

export function displayNameFromProfile(row: {
  display_name?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const name = String(row.display_name || '').trim();
  if (name) return name;
  const username = String(row.username || '').trim();
  if (username) return username;
  const email = String(row.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return email || 'Friend';
}

export async function ensureFriendCode(userId: string, existing?: string | null): Promise<string> {
  const current = normalizeFriendCode(existing || '');
  if (isValidFriendCode(current)) return current;
  return generateFriendCode(userId || 'guest');
}

export async function fetchOwnFriendCode(userId: string): Promise<string> {
  if (!canUse(userId) || !supabase) return generateFriendCode(userId);
  try {
    const { data } = await supabase.from('profiles').select('friend_code').eq('id', userId).maybeSingle();
    const stored = typeof data?.friend_code === 'string' ? data.friend_code : null;
    const code = await ensureFriendCode(userId, stored);
    if (code && code !== stored) {
      await supabase.from('profiles').update({ friend_code: code }).eq('id', userId);
    }
    return code;
  } catch {
    return generateFriendCode(userId);
  }
}

export async function ensureProfileDirectory(userId: string, email?: string, name?: string): Promise<string> {
  if (!canUse(userId) || !supabase) return generateFriendCode(userId || 'guest');
  const username = (email || '').split('@')[0]?.trim() || undefined;
  const displayName = (name || '').trim() || username;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, email, display_name, friend_code, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    let friendCode = await ensureFriendCode(userId, data?.friend_code as string | null | undefined);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const payload: {
        id: string;
        email: string | null;
        username: string | null;
        display_name: string | null;
        friend_code: string;
        avatar_url?: string;
      } = {
        id: userId,
        email: data?.email || email || null,
        username: data?.username || username || null,
        display_name: data?.display_name || displayName || null,
        friend_code: friendCode,
      };
      if (typeof data?.avatar_url === 'string' && data.avatar_url) {
        payload.avatar_url = data.avatar_url;
      }
      const { error } = await supabase.from('profiles').upsert(payload);
      if (!error) return friendCode;
      if (error.code === '23505') {
        friendCode = generateFriendCode(`${userId}:${attempt + 1}`);
        continue;
      }
      if (/friend_code/i.test(error.message)) {
        await supabase.from('profiles').upsert({
          id: userId,
          email: payload.email,
          username: payload.username,
          display_name: payload.display_name,
        });
        return friendCode;
      }
      break;
    }
    return friendCode;
  } catch {
    return generateFriendCode(userId);
  }
}

export async function connectByFriendCode(
  userId: string,
  rawCode: string
): Promise<{ ok: boolean; message: string }> {
  if (!canUse(userId) || !supabase) return { ok: false, message: 'Sign in to connect with a friend code.' };
  const code = normalizeFriendCode(rawCode);
  if (!isValidFriendCode(code)) {
    return { ok: false, message: 'Enter a 6-character friend code.' };
  }

  const ownCode = await fetchOwnFriendCode(userId);
  if (code === ownCode) {
    return { ok: false, message: 'You cannot connect with your own code.' };
  }

  try {
    const { data, error } = await supabase.rpc('connect_by_friend_code', { target_code: code });
    if (!error && data && typeof data === 'object') {
      const payload = data as { ok?: boolean; message?: string };
      return {
        ok: Boolean(payload.ok),
        message: String(payload.message || (payload.ok ? 'You are now friends.' : 'Could not connect.')),
      };
    }

    const { data: peer, error: lookupError } = await supabase
      .from('profiles')
      .select('id, display_name, username, friend_code')
      .eq('friend_code', code)
      .maybeSingle();
    if (lookupError || !peer?.id) {
      return { ok: false, message: 'No profile uses that code.' };
    }
    if (String(peer.id) === userId) {
      return { ok: false, message: 'You cannot connect with your own code.' };
    }

    const existing = await fetchFriendships(userId);
    const overlap = existing.find((edge) => edge.peerId === String(peer.id));
    if (overlap?.status === 'accepted') return { ok: true, message: 'Already connected.' };
    if (overlap?.status === 'pending' && overlap.userId === userId) {
      return { ok: true, message: 'Request already sent.' };
    }
    if (overlap?.status === 'pending' && overlap.friendId === userId) {
      const accepted = await respondToFriendRequest(overlap.id, 'accepted');
      return accepted
        ? { ok: true, message: 'Friend request accepted.' }
        : { ok: false, message: 'Could not accept request.' };
    }

    const { error: insertError } = await supabase.from(FRIENDSHIPS_TABLE).insert({
      user_id: userId,
      friend_id: String(peer.id),
      status: 'pending',
    });
    if (insertError) {
      if (import.meta.env.DEV) console.warn('friend code connect failed:', insertError.message);
      return { ok: false, message: 'Could not send request.' };
    }
    return { ok: true, message: 'Friend request sent.' };
  } catch {
    return { ok: false, message: 'Could not connect.' };
  }
}

interface ProfileLite {
  name: string;
  avatarUrl: string;
}

async function loadProfileMap(ids: string[]): Promise<Map<string, ProfileLite>> {
  const names = new Map<string, ProfileLite>();
  if (!supabase || ids.length === 0) return names;
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_profiles_lite', {
      profile_ids: ids,
    });
    if (!rpcError && Array.isArray(rpcData)) {
      rpcData.forEach((row: { id?: string; username?: string; display_name?: string; avatar_url?: string }) => {
        if (row?.id) {
          names.set(String(row.id), {
            name: displayNameFromProfile(row),
            avatarUrl: resolveAvatarId(typeof row.avatar_url === 'string' ? row.avatar_url : ''),
          });
        }
      });
      return names;
    }
  } catch {
    // Fall back to direct query if RPC not yet deployed
  }
  let { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids);
  if (error && /avatar_url/i.test(error.message)) {
    const retry = await supabase.from('profiles').select('id, username, display_name').in('id', ids);
    data = retry.data as typeof data;
    error = retry.error;
  }
  if (error) return names;
  (data || []).forEach((row) => {
    names.set(String(row.id), {
      name: displayNameFromProfile(row),
      avatarUrl: resolveAvatarId(typeof row.avatar_url === 'string' ? row.avatar_url : ''),
    });
  });
  return names;
}

function mapEdge(
  row: { id?: string; user_id?: string; friend_id?: string; status?: string; created_at?: string },
  selfId: string,
  profiles: Map<string, ProfileLite>
): FriendEdge | null {
  const userId = String(row.user_id || '');
  const friendId = String(row.friend_id || '');
  const status = row.status === 'accepted' ? 'accepted' : row.status === 'pending' ? 'pending' : null;
  if (!row.id || !userId || !friendId || !status) return null;
  const peerId = userId === selfId ? friendId : userId;
  const peer = profiles.get(peerId);
  return {
    id: String(row.id),
    userId,
    friendId,
    status,
    createdAt: String(row.created_at || ''),
    peerId,
    peerName: peer?.name || 'Friend',
    peerAvatar: peer?.avatarUrl || null,
  };
}

export async function fetchFriendships(userId: string): Promise<FriendEdge[]> {
  if (!canUse(userId) || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from(FRIENDSHIPS_TABLE)
      .select('id, user_id, friend_id, status, created_at')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (error) {
      if (import.meta.env.DEV) console.warn('friendships fetch failed:', error.message);
      return [];
    }
    const rows = data || [];
    const peerIds = Array.from(
      new Set(
        rows
          .map((row) => (row.user_id === userId ? String(row.friend_id) : String(row.user_id)))
          .filter(Boolean)
      )
    );
    const names = await loadProfileMap(peerIds);
    const mapped = rows
      .map((row) => mapEdge(row, userId, names))
      .filter((row): row is FriendEdge => row !== null);
    const byPeer = new Map<string, FriendEdge>();
    mapped.forEach((edge) => {
      const current = byPeer.get(edge.peerId);
      if (!current || (edge.status === 'accepted' && current.status !== 'accepted')) {
        byPeer.set(edge.peerId, edge);
      }
    });
    return [...byPeer.values()];
  } catch {
    return [];
  }
}

export function incomingPending(edges: FriendEdge[], userId: string): FriendEdge[] {
  return edges.filter((edge) => edge.status === 'pending' && edge.friendId === userId);
}

export function outgoingPending(edges: FriendEdge[], userId: string): FriendEdge[] {
  return edges.filter((edge) => edge.status === 'pending' && edge.userId === userId);
}

export async function respondToFriendRequest(edgeId: string, status: 'accepted' | 'declined'): Promise<boolean> {
  if (!supabase) return false;
  try {
    // 1. Prefer secure RPC which enforces recipient authorization and reciprocal edges atomically
    const { data: rpcData, error: rpcError } = await supabase.rpc('respond_to_friend_request', {
      edge_id: edgeId,
      new_status: status,
    });
    if (!rpcError && rpcData && typeof rpcData === 'object' && (rpcData as { ok?: boolean }).ok) {
      return true;
    }

    // 2. Fallback to direct table mutation if migration 023 is not yet applied to remote
    if (status === 'declined') {
      const { error } = await supabase.from(FRIENDSHIPS_TABLE).delete().eq('id', edgeId);
      return !error;
    }
    const { data, error } = await supabase
      .from(FRIENDSHIPS_TABLE)
      .update({ status: 'accepted' })
      .eq('id', edgeId)
      .eq('status', 'pending')
      .select('user_id, friend_id')
      .maybeSingle();
    if (!error && data?.user_id && data?.friend_id) {
      await supabase.from(FRIENDSHIPS_TABLE).insert({
        user_id: String(data.friend_id),
        friend_id: String(data.user_id),
        status: 'accepted',
      });
    }
    return !error;
  } catch {
    return false;
  }
}

/** Remove an accepted friendship for both parties. RLS already allows either side to delete. */
export async function removeFriendship(
  edgeId: string,
  pair?: { userId: string; peerId: string }
): Promise<boolean> {
  if (!supabase) return false;
  try {
    let userId = pair?.userId;
    let peerId = pair?.peerId;
    if ((!userId || !peerId) && edgeId) {
      const { data } = await supabase.from(FRIENDSHIPS_TABLE).select('user_id, friend_id').eq('id', edgeId).maybeSingle();
      if (data?.user_id && data?.friend_id) {
        userId = String(data.user_id);
        peerId = String(data.friend_id);
      }
    }
    if (userId && peerId) {
      const { error } = await supabase
        .from(FRIENDSHIPS_TABLE)
        .delete()
        .or(
          `and(user_id.eq.${userId},friend_id.eq.${peerId}),and(user_id.eq.${peerId},friend_id.eq.${userId})`
        );
      return !error;
    }
    const { error } = await supabase.from(FRIENDSHIPS_TABLE).delete().eq('id', edgeId);
    return !error;
  } catch {
    return false;
  }
}

export interface FriendIdentityLedger {
  friendId: string;
  displayName: string;
  avatarUrl?: string | null;
  identityStatement: string;
  /** 0–100 aggregate completion ratio for the cycle window (no habit titles). */
  completionRatio: number;
  cycleDays: number;
}

/**
 * Privacy-safe friend snapshot for Reports:
 * display name + identity statement + total completion ratio only.
 * Never returns habit names, schedules, or itemized activity.
 */
export async function fetchFriendIdentityLedger(
  viewerId: string,
  friendId: string,
  cycleDays = 7
): Promise<FriendIdentityLedger | null> {
  if (!canUse(viewerId) || !supabase || !friendId) return null;
  const edges = await fetchFriendships(viewerId);
  const edge = edges.find((item) => item.peerId === friendId && item.status === 'accepted');
  if (!edge) return null;

  const days = Math.min(10, Math.max(1, Math.round(cycleDays)));
  const endIso = toISODate();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  const startIso = `${y}-${m}-${d}`;

  const emptyLedger = (): FriendIdentityLedger => ({
    friendId,
    displayName: edge.peerName || 'Friend',
    avatarUrl: edge.peerAvatar ?? null,
    identityStatement: 'Building consistency, one vote at a time.',
    completionRatio: 0,
    cycleDays: days,
  });

  try {
    // 1. Try secure RPC to get friend's identity statement and active habit count without leaking titles
    let identityStatement = 'Building consistency, one vote at a time.';
    let activeHabitCount = 0;
    let rpcSuccess = false;

    try {
      const { data: summaryData, error: summaryError } = await supabase.rpc('get_friend_identity_summary', {
        p_friend_id: friendId,
      });
      if (!summaryError && Array.isArray(summaryData) && summaryData.length > 0) {
        const summary = summaryData[0] as { identity_statement?: string; active_habit_count?: number };
        if (summary.identity_statement) identityStatement = summary.identity_statement;
        if (typeof summary.active_habit_count === 'number') activeHabitCount = summary.active_habit_count;
        rpcSuccess = true;
      }
    } catch {
      // RPC not yet deployed
    }

    const { data: events } = await supabase
      .from('momentum_events')
      .select('habit_id, timestamp')
      .eq('user_id', friendId)
      .in('event_type', ['full', 'fallback'])
      .gte('timestamp', `${startIso}T00:00:00`)
      .lt('timestamp', `${endIso}T23:59:59.999`)
      .limit(400);

    if (!rpcSuccess) {
      // Fallback path if migration 023 is not yet applied
      const { data: habitRows } = await supabase
        .from('habits')
        .select('identity_statement, is_keystone, archived, is_archived')
        .eq('user_id', friendId);

      const activeHabits = (habitRows || []).filter(
        (row) => !row.archived && !row.is_archived
      );
      activeHabitCount = activeHabits.length;
      const keystone = activeHabits.find(
        (row) => row.is_keystone && String(row.identity_statement || '').trim()
      );
      const anyStatement = activeHabits.find((row) => String(row.identity_statement || '').trim());
      identityStatement =
        String(keystone?.identity_statement || '').trim() ||
        String(anyStatement?.identity_statement || '').trim() ||
        'Building consistency, one vote at a time.';
    }

    const completedPairs = new Set<string>();
    (events || []).forEach((row) => {
      const habitId = String(row.habit_id || '');
      const iso = String(row.timestamp || '').slice(0, 10);
      if (habitId && iso) completedPairs.add(`${habitId}|${iso}`);
    });
    const possible = Math.max(1, activeHabitCount * days);
    const completionRatio = Math.min(
      100,
      Math.round((completedPairs.size / possible) * 100)
    );

    return {
      friendId,
      displayName: edge.peerName || 'Friend',
      avatarUrl: edge.peerAvatar ?? null,
      identityStatement,
      completionRatio,
      cycleDays: days,
    };
  } catch {
    return emptyLedger();
  }
}
