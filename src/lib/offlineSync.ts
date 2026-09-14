import { HabitCompletionEvent, UserProfile } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';
import { isoDateForDayIndex, isIsoDate } from '../utils/dates';

const LOG_QUEUE_KEY = 'ascend_offline_habit_log_queue';
const PROFILE_QUEUE_KEY = 'ascend_offline_profile_queue';
const PROFILE_CACHE_KEY = 'ascend_profile_cache';

type HabitLogQueueItem =
  | { kind: 'upsert'; userId: string; event: HabitCompletionEvent }
  | { kind: 'delete'; userId: string; habitId: string; dayIndex: number };

type ProfilePatch = Partial<Pick<UserProfile, 'interests' | 'has_completed_tutorial' | 'avatar_url'>>;

interface ProfileQueueItem {
  userId: string;
  patch: ProfilePatch;
}

function canSync(userId?: string | null): boolean {
  return Boolean(isSupabaseConfigured && supabase && userId && !userId.startsWith('guest_'));
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

function readLogQueue(): HabitLogQueueItem[] {
  return readJson<HabitLogQueueItem[]>(LOG_QUEUE_KEY, []);
}

function writeLogQueue(items: HabitLogQueueItem[]): void {
  writeJson(LOG_QUEUE_KEY, items);
}

function enqueueLog(item: HabitLogQueueItem): void {
  const next = readLogQueue();
  if (item.kind === 'upsert') {
    const filtered = next.filter(
      (entry) =>
        !(
          entry.kind === 'upsert' &&
          entry.event.habitId === item.event.habitId &&
          entry.event.dayIndex === item.event.dayIndex
        )
    );
    writeLogQueue([...filtered, item]);
    return;
  }
  writeLogQueue([...next, item]);
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
  const loggedDate = isIsoDate(event.date) ? event.date : isoDateForDayIndex(event.dayIndex);
  const completion = event.type === 'fallback_micro' ? 0.5 : 1;
  const row = {
    id: event.id,
    user_id: userId,
    habit_id: event.habitId,
    logged_date: loggedDate,
    date: event.date,
    day_index: event.dayIndex,
    type: event.type,
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
  dayIndex: number
): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  try {
    const loggedDate = isoDateForDayIndex(dayIndex);
    const byDate = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('logged_date', loggedDate);
    if (!byDate.error) return true;

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
  dayIndex: number
): Promise<void> {
  if (!canSync(userId) || !userId) return;
  if (!isOnline()) {
    enqueueLog({ kind: 'delete', userId, habitId, dayIndex });
    return;
  }
  const ok = await pushHabitLogDeleteRemote(userId, habitId, dayIndex);
  if (!ok) enqueueLog({ kind: 'delete', userId, habitId, dayIndex });
}

export async function syncProfilePatch(userId: string, patch: ProfilePatch): Promise<void> {
  if (!canSync(userId)) return;
  if (!isOnline()) {
    enqueueProfile({ userId, patch });
    return;
  }
  const ok = await pushProfileRemote(userId, patch);
  if (!ok) enqueueProfile({ userId, patch });
}

export async function flushOfflineQueue(): Promise<void> {
  if (!isOnline() || !isSupabaseConfigured || !supabase) return;

  const remainingLogs: HabitLogQueueItem[] = [];
  for (const item of readLogQueue()) {
    const ok =
      item.kind === 'upsert'
        ? await pushHabitLogRemote(item.userId, item.event)
        : await pushHabitLogDeleteRemote(item.userId, item.habitId, item.dayIndex);
    if (!ok) remainingLogs.push(item);
  }
  writeLogQueue(remainingLogs);

  const remainingProfiles: ProfileQueueItem[] = [];
  for (const item of readJson<ProfileQueueItem[]>(PROFILE_QUEUE_KEY, [])) {
    const ok = await pushProfileRemote(item.userId, item.patch);
    if (!ok) remainingProfiles.push(item);
  }
  writeJson(PROFILE_QUEUE_KEY, remainingProfiles);

  try {
    const { flushMomentumEventQueue } = await import('./momentumEvents');
    await flushMomentumEventQueue();
  } catch {
    // momentum_events table may not exist yet on older projects.
  }
}

export function startOfflineSyncListener(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    void flushOfflineQueue();
  });
  if (isOnline()) {
    void flushOfflineQueue();
  }
}
