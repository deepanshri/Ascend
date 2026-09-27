import { HabitCompletionEvent, UserProfile } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';
import { isoDateForDayIndex, isIsoDate } from '../utils/dates';
import { flushMomentumEventQueue } from './momentumEvents';

const LOG_QUEUE_KEY = 'ascend_offline_habit_log_queue';
const PROFILE_QUEUE_KEY = 'ascend_offline_profile_queue';
const PROFILE_CACHE_KEY = 'ascend_profile_cache';

type HabitLogQueueItem =
  | { kind: 'upsert'; userId: string; event: HabitCompletionEvent }
  | { kind: 'delete'; userId: string; habitId: string; loggedDate: string; dayIndex?: number };

type ProfilePatch = Partial<Pick<UserProfile, 'interests' | 'has_completed_tutorial' | 'avatar_url'>>;

interface ProfileQueueItem {
  userId: string;
  patch: ProfilePatch;
}

function canSync(userId?: string | null): boolean {
  return Boolean(isSupabaseConfigured && supabase && userId && !userId.startsWith('guest_'));
}

function resolveQueuedDelete(
  item: HabitLogQueueItem | { kind: 'delete'; userId: string; habitId: string; dayIndex?: number; loggedDate?: string }
): { userId: string; habitId: string; loggedDate: string; dayIndex?: number } | null {
  if (item.kind !== 'delete') return null;
  const loggedDate =
    'loggedDate' in item && isIsoDate(item.loggedDate)
      ? item.loggedDate
      : typeof item.dayIndex === 'number'
        ? isoDateForDayIndex(item.dayIndex, new Date())
        : null;
  if (!loggedDate) return null;
  return { userId: item.userId, habitId: item.habitId, loggedDate, dayIndex: item.dayIndex };
}

function isOnline(): boolean {
  try {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  } catch {
    return true;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private-mode: local queue is best-effort.
  }
}

export function cacheProfileLocally(profile: UserProfile): void {
  writeJson(`${PROFILE_CACHE_KEY}:${profile.id}`, profile);
}

export function readCachedProfile(userId: string): UserProfile | null {
  return readJson<UserProfile | null>(`${PROFILE_CACHE_KEY}:${userId}`, null);
}

export function resolveQueueItemKey(item: HabitLogQueueItem): { habitId: string; loggedDate: string } {
  if (item.kind === 'upsert') {
    const loggedDate =
      item.event.date && isIsoDate(item.event.date)
        ? item.event.date
        : isoDateForDayIndex(item.event.dayIndex, new Date(item.event.timestamp || Date.now()));
    return { habitId: item.event.habitId, loggedDate };
  }
  const loggedDate =
    isIsoDate(item.loggedDate)
      ? item.loggedDate
      : typeof item.dayIndex === 'number'
        ? isoDateForDayIndex(item.dayIndex, new Date())
        : item.loggedDate;
  return { habitId: item.habitId, loggedDate };
}

export function readLogQueue(): HabitLogQueueItem[] {
  return readJson<HabitLogQueueItem[]>(LOG_QUEUE_KEY, []);
}

function writeLogQueue(items: HabitLogQueueItem[]): void {
  writeJson(LOG_QUEUE_KEY, items);
}

function enqueueLog(item: HabitLogQueueItem): void {
  const next = readLogQueue();
  const { habitId, loggedDate } = resolveQueueItemKey(item);

  if (item.kind === 'delete') {
    const hadPendingUpsert = next.some((entry) => {
      if (entry.kind !== 'upsert') return false;
      const key = resolveQueueItemKey(entry);
      return key.habitId === habitId && key.loggedDate === loggedDate;
    });

    const filtered = next.filter((entry) => {
      const key = resolveQueueItemKey(entry);
      return !(key.habitId === habitId && key.loggedDate === loggedDate);
    });

    if (hadPendingUpsert) {
      // Offline complete + un-complete cancel each other out symmetrically:
      // The pending upsert never reached the remote, so no remote deletion is required.
      writeLogQueue(filtered);
      return;
    }

    // No pending upsert found: this was previously synced to remote, so keep the delete.
    writeLogQueue([...filtered, item]);
    return;
  }

  // item.kind === 'upsert'
  const hadPendingDelete = next.some((entry) => {
    if (entry.kind !== 'delete') return false;
    const key = resolveQueueItemKey(entry);
    return key.habitId === habitId && key.loggedDate === loggedDate;
  });

  const filtered = next.filter((entry) => {
    const key = resolveQueueItemKey(entry);
    return !(key.habitId === habitId && key.loggedDate === loggedDate);
  });

  if (hadPendingDelete && item.event.type !== 'fallback_micro') {
    // Offline delete + re-complete to normal cancels out the deletion without redundant network traffic.
    writeLogQueue(filtered);
    return;
  }

  writeLogQueue([...filtered, item]);
}

function enqueueProfile(item: ProfileQueueItem): void {
  const next = readJson<ProfileQueueItem[]>(PROFILE_QUEUE_KEY, []).filter((entry) => entry.userId !== item.userId);
  writeJson(PROFILE_QUEUE_KEY, [...next, item]);
}

export async function pushHabitLogRemote(
  userId: string,
  event: HabitCompletionEvent
): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  const loggedDate = isIsoDate(event.date)
    ? event.date
    : isoDateForDayIndex(event.dayIndex, new Date(event.timestamp || Date.now()));
  const completion = event.type === 'fallback_micro' ? 0.5 : 1;
  const completionType = event.type === 'fallback_micro' ? 'fallback' : 'full';
  const row = {
    id: event.id,
    user_id: userId,
    habit_id: event.habitId,
    logged_date: loggedDate,
    date: event.date,
    day_index: event.dayIndex,
    type: event.type,
    completion_type: completionType,
    completion,
    value: completion,
    note: event.note || null,
    friction_reason: event.frictionReason || null,
    timestamp: event.timestamp,
  };

  try {
    const upserted = await supabase.from('habit_logs').upsert(row, { onConflict: 'habit_id,logged_date' });
    if (!upserted.error) return true;

    await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', event.habitId)
      .eq('logged_date', loggedDate);

    const inserted = await supabase.from('habit_logs').insert(row);
    if (!inserted.error) return true;

    await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', event.habitId)
      .eq('day_index', event.dayIndex);

    const retry = await supabase.from('habit_logs').insert(row);
    return !retry.error;
  } catch {
    return false;
  }
}

export async function pushHabitLogDeleteRemote(
  userId: string,
  habitId: string,
  loggedDate: string,
  dayIndex?: number
): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  try {
    const byDate = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('logged_date', loggedDate);
    if (!byDate.error) return true;

    if (dayIndex == null) return false;

    const byIndex = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('day_index', dayIndex);
    return !byIndex.error;
  } catch {
    return false;
  }
}

export async function pushProfileRemote(
  userId: string,
  patch: ProfilePatch
): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  try {
    const payload: Record<string, unknown> = {
      id: userId,
      updated_at: new Date().toISOString(),
    };
    if (patch.interests) payload.interests = patch.interests;
    if (typeof patch.has_completed_tutorial === 'boolean') {
      payload.has_completed_tutorial = patch.has_completed_tutorial;
    }
    if (typeof patch.avatar_url === 'string') payload.avatar_url = patch.avatar_url;
    const { error } = await supabase.from('profiles').upsert(payload);
    if (error && /avatar_url/i.test(error.message) && 'avatar_url' in payload) {
      delete payload.avatar_url;
      const retry = await supabase.from('profiles').upsert(payload);
      return !retry.error;
    }
    return !error;
  } catch {
    return false;
  }
}

export async function syncHabitLogUpsert(
  userId: string | null | undefined,
  event: HabitCompletionEvent
): Promise<void> {
  if (!canSync(userId) || !userId) return;
  if (!isOnline()) {
    enqueueLog({ kind: 'upsert', userId, event });
    return;
  }
  const ok = await pushHabitLogRemote(userId, event);
  if (!ok) enqueueLog({ kind: 'upsert', userId, event });
}

export async function syncHabitLogDelete(
  userId: string | null | undefined,
  habitId: string,
  loggedDate: string,
  dayIndex?: number
): Promise<void> {
  if (!canSync(userId) || !userId) return;
  if (!isOnline()) {
    enqueueLog({ kind: 'delete', userId, habitId, loggedDate, dayIndex });
    return;
  }
  const ok = await pushHabitLogDeleteRemote(userId, habitId, loggedDate, dayIndex);
  if (!ok) enqueueLog({ kind: 'delete', userId, habitId, loggedDate, dayIndex });
}

export async function syncProfilePatch(userId: string, patch: ProfilePatch): Promise<boolean> {
  if (!canSync(userId)) return false;
  if (!isOnline()) {
    enqueueProfile({ userId, patch });
    return false;
  }
  const ok = await pushProfileRemote(userId, patch);
  if (!ok) enqueueProfile({ userId, patch });
  return ok;
}

export async function flushOfflineQueue(): Promise<void> {
  if (!isOnline() || !isSupabaseConfigured || !supabase) return;

  const remainingLogs: HabitLogQueueItem[] = [];
  for (const item of readLogQueue()) {
    if (item.kind === 'upsert') {
      const ok = await pushHabitLogRemote(item.userId, item.event);
      if (!ok) remainingLogs.push(item);
      continue;
    }
    const del = resolveQueuedDelete(item);
    if (!del) continue;
    const ok = await pushHabitLogDeleteRemote(del.userId, del.habitId, del.loggedDate, del.dayIndex);
    if (!ok) remainingLogs.push({ kind: 'delete', ...del });
  }
  writeLogQueue(remainingLogs);

  const remainingProfiles: ProfileQueueItem[] = [];
  for (const item of readJson<ProfileQueueItem[]>(PROFILE_QUEUE_KEY, [])) {
    const ok = await pushProfileRemote(item.userId, item.patch);
    if (!ok) remainingProfiles.push(item);
  }
  writeJson(PROFILE_QUEUE_KEY, remainingProfiles);

  try {
    await flushMomentumEventQueue();
  } catch {
    // momentum_events table may not exist yet on older projects.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ascend_offline_sync_completed'));
  }
}

let offlineSyncStarted = false;

export function startOfflineSyncListener(): void {
  if (typeof window === 'undefined' || offlineSyncStarted) return;
  offlineSyncStarted = true;
  window.addEventListener('online', () => {
    void flushOfflineQueue().catch(() => {});
  });
  if (isOnline()) {
    void flushOfflineQueue().catch(() => {});
  }
}
