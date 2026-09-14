import { generateFriendCode, isValidFriendCode, normalizeFriendCode } from '../utils/friendCode';
import { isSupabaseConfigured, supabase } from './supabase';

export type FriendStatus = 'pending' | 'accepted';

export interface ProfileDirectoryHit {
  id: string;
  username: string;
  email: string;
  displayName: string;
}

export interface FriendEdge {
  id: string;
  userId: string;
  friendId: string;
  status: FriendStatus;
  createdAt: string;
  peerId: string;
  peerName: string;
}

export interface FriendActivityItem {
  id: string;
  friendId: string;
  friendName: string;
  kind: 'habit' | 'milestone';
  text: string;
  timestamp: number;
}

const IDENTITY_STAGE_THRESHOLDS = [1, 10, 25, 50, 100];

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

export function identityStageFromVotes(votes: number): number {
  if (votes >= 100) return 5;
  if (votes >= 50) return 4;
  if (votes >= 25) return 3;
  if (votes >= 10) return 2;
  if (votes >= 1) return 1;
  return 0;
}

function stageUnlockedAt(previousVotes: number, nextVotes: number): number | null {
  for (const threshold of IDENTITY_STAGE_THRESHOLDS) {
    if (previousVotes < threshold && nextVotes >= threshold) {
      return identityStageFromVotes(nextVotes);
    }
  }
  return null;
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
      .select('id, username, email, display_name, friend_code')
      .eq('id', userId)
      .maybeSingle();
    let friendCode = await ensureFriendCode(userId, data?.friend_code as string | null | undefined);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const payload = {
        id: userId,
        email: data?.email || email || null,
        username: data?.username || username || null,
        display_name: data?.display_name || displayName || null,
        friend_code: friendCode,
      };
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
    const { data, error } = await supabase.rpc('connect_by_friend_code', { input_code: code });
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
    if (overlap) {
      const { error: upgradeError } = await supabase
        .from('friends')
        .update({ status: 'accepted' })
        .eq('id', overlap.id);
      if (upgradeError) return { ok: false, message: 'Could not connect.' };
      return { ok: true, message: 'You are now friends.' };
    }

    const { error: insertError } = await supabase.from('friends').insert({
      user_id: userId,
      friend_id: String(peer.id),
      status: 'accepted',
    });
    if (insertError) {
      console.warn('friend code connect failed:', insertError.message);
      return { ok: false, message: 'Could not connect.' };
    }
    return { ok: true, message: 'You are now friends.' };
  } catch {
    return { ok: false, message: 'Could not connect.' };
  }
}

export async function searchProfiles(query: string): Promise<ProfileDirectoryHit[]> {
  const q = query.trim();
  if (!supabase || q.length < 2) return [];
  try {
    const { data, error } = await supabase.rpc('search_profiles', { query: q });
    if (error) {
      console.warn('search_profiles failed:', error.message);
      return [];
    }
    return (data || [])
      .map((row: { id?: string; username?: string; email?: string; display_name?: string }) => ({
        id: String(row.id || ''),
        username: String(row.username || ''),
        email: String(row.email || ''),
        displayName: displayNameFromProfile(row),
      }))
      .filter((row: ProfileDirectoryHit) => Boolean(row.id));
  } catch {
    return [];
  }
}

async function loadProfileMap(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!supabase || ids.length === 0) return names;
  const { data } = await supabase
    .from('profiles')
    .select('id, username, email, display_name')
    .in('id', ids);
  (data || []).forEach((row) => {
    names.set(String(row.id), displayNameFromProfile(row));
  });
  return names;
}

function mapEdge(
  row: { id?: string; user_id?: string; friend_id?: string; status?: string; created_at?: string },
  selfId: string,
  names: Map<string, string>
): FriendEdge | null {
  const userId = String(row.user_id || '');
  const friendId = String(row.friend_id || '');
  const status = row.status === 'accepted' ? 'accepted' : row.status === 'pending' ? 'pending' : null;
  if (!row.id || !userId || !friendId || !status) return null;
  const peerId = userId === selfId ? friendId : userId;
  return {
    id: String(row.id),
    userId,
    friendId,
    status,
    createdAt: String(row.created_at || ''),
    peerId,
    peerName: names.get(peerId) || 'Friend',
  };
}

export async function fetchFriendships(userId: string): Promise<FriendEdge[]> {
  if (!canUse(userId) || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('friends')
      .select('id, user_id, friend_id, status, created_at')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('friends fetch failed:', error.message);
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
    return rows
      .map((row) => mapEdge(row, userId, names))
      .filter((row): row is FriendEdge => row !== null);
  } catch {
    return [];
  }
}

export function acceptedFriendIds(edges: FriendEdge[], userId: string): string[] {
  return edges.filter((edge) => edge.status === 'accepted').map((edge) => edge.peerId || (edge.userId === userId ? edge.friendId : edge.userId));
}

export function incomingPending(edges: FriendEdge[], userId: string): FriendEdge[] {
  return edges.filter((edge) => edge.status === 'pending' && edge.friendId === userId);
}

export function outgoingPending(edges: FriendEdge[], userId: string): FriendEdge[] {
  return edges.filter((edge) => edge.status === 'pending' && edge.userId === userId);
}

export async function sendFriendRequest(userId: string, friendId: string): Promise<{ ok: boolean; message: string }> {
  if (!canUse(userId) || !supabase) return { ok: false, message: 'Sign in to add friends.' };
  if (userId === friendId) return { ok: false, message: 'You cannot add yourself.' };
  try {
    const existing = await fetchFriendships(userId);
    const overlap = existing.find(
      (edge) =>
        (edge.userId === userId && edge.friendId === friendId) ||
        (edge.userId === friendId && edge.friendId === userId)
    );
    if (overlap?.status === 'accepted') return { ok: false, message: 'Already friends.' };
    if (overlap?.status === 'pending' && overlap.userId === userId) {
      return { ok: false, message: 'Request already sent.' };
    }
    if (overlap?.status === 'pending' && overlap.friendId === userId) {
      const accepted = await respondToFriendRequest(overlap.id, 'accepted');
      return accepted ? { ok: true, message: 'Friend request accepted.' } : { ok: false, message: 'Could not accept request.' };
    }
    const { error } = await supabase.from('friends').insert({
      user_id: userId,
      friend_id: friendId,
      status: 'pending',
    });
    if (error) {
      console.warn('friend request failed:', error.message);
      return { ok: false, message: 'Could not send request.' };
    }
    return { ok: true, message: 'Friend request sent.' };
  } catch {
    return { ok: false, message: 'Could not send request.' };
  }
}

export async function respondToFriendRequest(edgeId: string, status: 'accepted' | 'declined'): Promise<boolean> {
  if (!supabase) return false;
  try {
    if (status === 'declined') {
      const { error } = await supabase.from('friends').delete().eq('id', edgeId);
      return !error;
    }
    const { error } = await supabase.from('friends').update({ status: 'accepted' }).eq('id', edgeId);
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
      const { data } = await supabase.from('friends').select('user_id, friend_id').eq('id', edgeId).maybeSingle();
      if (data?.user_id && data?.friend_id) {
        userId = String(data.user_id);
        peerId = String(data.friend_id);
      }
    }
    if (userId && peerId) {
      const { error } = await supabase
        .from('friends')
        .delete()
        .or(
          `and(user_id.eq.${userId},friend_id.eq.${peerId}),and(user_id.eq.${peerId},friend_id.eq.${userId})`
        );
      return !error;
    }
    const { error } = await supabase.from('friends').delete().eq('id', edgeId);
    return !error;
  } catch {
    return false;
  }
}

export interface ReceivedAffirmationGlow {
  id: string;
  fromUserId: string;
  fromName: string;
  eventId: string;
  createdAt: string;
}

export async function fetchSentGlowEventIds(userId: string): Promise<Set<string>> {
  const sent = new Set<string>();
  if (!canUse(userId) || !supabase) return sent;
  try {
    const { data, error } = await supabase
      .from('affirmation_glows')
      .select('event_id')
      .eq('from_user_id', userId);
    if (error) return sent;
    (data || []).forEach((row) => {
      if (row.event_id) sent.add(String(row.event_id));
    });
  } catch {
    // Table missing until 008_affirmation_glows.sql is applied.
  }
  return sent;
}

export async function fetchReceivedGlows(userId: string): Promise<ReceivedAffirmationGlow[]> {
  if (!canUse(userId) || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('affirmation_glows')
      .select('id, from_user_id, event_id, created_at')
      .eq('to_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data) return [];
    const fromIds = Array.from(new Set(data.map((row) => String(row.from_user_id || '')).filter(Boolean)));
    const names = await loadProfileMap(fromIds);
    return data.map((row) => ({
      id: String(row.id),
      fromUserId: String(row.from_user_id),
      fromName: names.get(String(row.from_user_id)) || 'A friend',
      eventId: String(row.event_id || ''),
      createdAt: String(row.created_at || ''),
    }));
  } catch {
    return [];
  }
}

export async function sendAffirmationGlow(
  fromUserId: string,
  toUserId: string,
  eventId: string
): Promise<{ ok: boolean; message: string }> {
  if (!canUse(fromUserId) || !supabase) return { ok: false, message: 'Sign in to send a glow.' };
  if (fromUserId === toUserId) return { ok: false, message: 'You cannot glow your own update.' };
  try {
    const { error } = await supabase.from('affirmation_glows').insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      event_id: eventId,
    });
    if (error) {
      if (String(error.message || '').toLowerCase().includes('duplicate') || error.code === '23505') {
        return { ok: true, message: 'Glow already sent.' };
      }
      console.warn('affirmation glow failed:', error.message);
      return { ok: false, message: 'Could not send glow.' };
    }
    return { ok: true, message: 'Affirmation Glow sent.' };
  } catch {
    return { ok: false, message: 'Could not send glow.' };
  }
}

export async function retractAffirmationGlow(fromUserId: string, eventId: string): Promise<boolean> {
  if (!canUse(fromUserId) || !supabase) return false;
  try {
    const { error } = await supabase
      .from('affirmation_glows')
      .delete()
      .eq('from_user_id', fromUserId)
      .eq('event_id', eventId);
    return !error;
  } catch {
    return false;
  }
}

async function loadHabitNames(friendIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!supabase || friendIds.length === 0) return names;
  const { data } = await supabase.from('habits').select('id, title, name, user_id').in('user_id', friendIds);
  (data || []).forEach((row) => {
    const title = String(row.title || row.name || '').trim();
    if (row.id && title) names.set(String(row.id), title);
  });
  return names;
}

async function loadVoteTotals(friendIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (!supabase || friendIds.length === 0) return totals;
  await Promise.all(
    friendIds.map(async (friendId) => {
      const { count } = await supabase!
        .from('momentum_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', friendId)
        .in('event_type', ['full', 'fallback']);
      totals.set(friendId, count ?? 0);
    })
  );
  return totals;
}

export async function fetchFriendActivity(userId: string, edges: FriendEdge[]): Promise<FriendActivityItem[]> {
  if (!canUse(userId) || !supabase) return [];
  const friendIds = acceptedFriendIds(edges, userId);
  if (friendIds.length === 0) return [];

  try {
    const [{ data: events, error }, habitNames] = await Promise.all([
      supabase
        .from('momentum_events')
        .select('id, user_id, habit_id, event_type, timestamp')
        .in('user_id', friendIds)
        .in('event_type', ['full', 'fallback'])
        .order('timestamp', { ascending: false })
        .limit(80),
      loadHabitNames(friendIds),
    ]);

    if (error) {
      console.warn('friend momentum_events fetch failed:', error.message);
      return [];
    }

    const recent = events || [];
    const activeFriendIds = Array.from(new Set(recent.map((row) => String(row.user_id || '')).filter(Boolean)));
    const remainingVotes = await loadVoteTotals(activeFriendIds);
    const names = new Map(edges.map((edge) => [edge.peerId, edge.peerName]));
    const items: FriendActivityItem[] = [];

    recent.forEach((row) => {
      const friendId = String(row.user_id || '');
      const friendName = names.get(friendId) || 'Friend';
      const timestamp = Date.parse(String(row.timestamp)) || Date.now();
      const current = remainingVotes.get(friendId) ?? 0;
      const previous = Math.max(0, current - 1);
      const unlocked = stageUnlockedAt(previous, current);
      if (unlocked && unlocked >= 2) {
        items.push({
          id: `stage-${friendId}-${unlocked}-${row.id}`,
          friendId,
          friendName,
          kind: 'milestone',
          text: `${friendName} unlocked Identity Stage ${unlocked}`,
          timestamp,
        });
      }
      remainingVotes.set(friendId, previous);

      const habitName = habitNames.get(String(row.habit_id || '')) || 'a habit';
      const verb = row.event_type === 'fallback' ? 'protected momentum on' : 'completed';
      items.push({
        id: String(row.id),
        friendId,
        friendName,
        kind: 'habit',
        text: `${friendName} ${verb} ${habitName}`,
        timestamp,
      });
    });

    return items.slice(0, 40);
  } catch {
    return [];
  }
}

/** @deprecated Local seed list. Use fetchFriendships / FriendsFeed. */
export interface FriendFeedItem {
  id: string;
  name: string;
  momentum: number;
}

export function loadFriendsFeed(): FriendFeedItem[] {
  return [];
}
