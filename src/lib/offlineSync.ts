import { HabitCompletionEvent, UserProfile } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';
import { isoDateForDayIndex, isIsoDate } from '../utils/dates';
import { flushMomentumEventQueue, queuedMomentumEventCount } from './momentumEvents';
import { flushChronicleQueue, queuedChronicleCount } from './chronicleSync';
import { flushFeedbackQueue, queuedFeedbackCount } from './feedbackSync';
import { readJson, writeJson } from './storage';
import { inFlightSyncCount, syncGeneration, trackInFlight } from './syncState';

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

/** Queue `item` unless local user data was purged since generation `gen` (sign-out, account switch). */
function enqueueLogSince(gen: number, item: HabitLogQueueItem): void {
  if (gen === syncGeneration()) enqueueLog(item);
}

function enqueueProfile(item: ProfileQueueItem): void {
  const next = readJson<ProfileQueueItem[]>(PROFILE_QUEUE_KEY, []).filter((entry) => entry.userId !== item.userId);
  writeJson(PROFILE_QUEUE_KEY, [...next, item]);
}

function habitLogRow(userId: string, event: HabitCompletionEvent) {
  const loggedDate = isIsoDate(event.date)
    ? event.date
    : isoDateForDayIndex(event.dayIndex, new Date(event.timestamp || Date.now()));
  const completion = event.type === 'fallback_micro' ? 0.5 : 1;
  const completionType = event.type === 'fallback_micro' ? 'fallback' : 'full';
  return {
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
}

export async function pushHabitLogRemote(
  userId: string,
  event: HabitCompletionEvent
): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  const row = habitLogRow(userId, event);
  const loggedDate = row.logged_date;

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

    // Older schemas without logged_date: match the legacy text `date` column.
    // day_index is a weekday slot (0–6) shared by every week, so it must never
    // be the only date filter on a delete.
    await deleteLegacyDayRow(userId, event.habitId, loggedDate, event.dayIndex);

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

    return await deleteLegacyDayRow(userId, habitId, loggedDate, dayIndex);
  } catch {
    return false;
  }
}

/**
 * Fallback delete for one (habit, day) row on schemas without `logged_date`.
 * Always pinned to the day through the legacy text `date` column: day_index
 * alone matches that weekday in every week of the habit's history.
 */
async function deleteLegacyDayRow(
  userId: string,
  habitId: string,
  loggedDate: string,
  dayIndex: number
): Promise<boolean> {
  if (!supabase || !isIsoDate(loggedDate)) return false;
  const { error } = await supabase
    .from('habit_logs')
    .delete()
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('date', loggedDate)
    .eq('day_index', dayIndex);
  return !error;
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

/**
 * Upsert many habit logs in one request (one statement on (habit_id, logged_date)).
 * Offline or on failure every row joins the offline queue, whose flush keeps
 * the per-row schema fallbacks of pushHabitLogRemote.
 */
export async function syncHabitLogUpserts(
  userId: string | null | undefined,
  events: HabitCompletionEvent[]
): Promise<void> {
  if (!canSync(userId) || !userId || events.length === 0) return;
  // One row per (habit, day): Postgres rejects a statement that hits the same conflict key twice.
  const byKey = new Map<string, HabitCompletionEvent>();
  for (const event of events) {
    const { habitId, loggedDate } = resolveQueueItemKey({ kind: 'upsert', userId, event });
    byKey.set(`${habitId}|${loggedDate}`, event);
  }
  const unique = [...byKey.values()];
  const gen = syncGeneration();
  const queueAll = () => unique.forEach((event) => enqueueLogSince(gen, { kind: 'upsert', userId, event }));
  if (!isOnline() || !supabase) {
    queueAll();
    return;
  }
  const ok = await trackInFlight(unique.length, () => pushHabitLogsRemote(userId, unique));
  if (!ok) queueAll();
}

/** Rows per request: keeps a full-history push well inside request size limits. */
const HABIT_LOG_BATCH_SIZE = 500;

/**
 * Write many logs of one user now: one upsert per HABIT_LOG_BATCH_SIZE rows,
 * falling back to the per-row path (with its schema fallbacks) only for a
 * batch the server rejects. Returns whether every row was written.
 */
export async function pushHabitLogsNow(userId: string, events: HabitCompletionEvent[]): Promise<boolean> {
  let ok = true;
  for (let start = 0; start < events.length; start += HABIT_LOG_BATCH_SIZE) {
    const batch = events.slice(start, start + HABIT_LOG_BATCH_SIZE);
    if (await pushHabitLogsRemote(userId, batch)) continue;
    for (const event of batch) {
      if (!(await pushHabitLogRemote(userId, event))) ok = false;
    }
  }
  return ok;
}

/** One upsert request for many logs of one user; rows are de-duplicated per (habit, day). */
async function pushHabitLogsRemote(userId: string, events: HabitCompletionEvent[]): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  const byKey = new Map<string, HabitCompletionEvent>();
  for (const event of events) {
    const { habitId, loggedDate } = resolveQueueItemKey({ kind: 'upsert', userId, event });
    byKey.set(`${habitId}|${loggedDate}`, event);
  }
  try {
    const { error } = await supabase
      .from('habit_logs')
      .upsert([...byKey.values()].map((event) => habitLogRow(userId, event)), { onConflict: 'habit_id,logged_date' });
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
  const gen = syncGeneration();
  if (!isOnline()) {
    enqueueLogSince(gen, { kind: 'upsert', userId, event });
    return;
  }
  const ok = await trackInFlight(1, () => pushHabitLogRemote(userId, event));
  if (!ok) enqueueLogSince(gen, { kind: 'upsert', userId, event });
}

export async function syncHabitLogDelete(
  userId: string | null | undefined,
  habitId: string,
  loggedDate: string,
  dayIndex?: number
): Promise<void> {
  if (!canSync(userId) || !userId) return;
  const gen = syncGeneration();
  if (!isOnline()) {
    enqueueLogSince(gen, { kind: 'delete', userId, habitId, loggedDate, dayIndex });
    return;
  }
  const ok = await trackInFlight(1, () => pushHabitLogDeleteRemote(userId, habitId, loggedDate, dayIndex));
  if (!ok) enqueueLogSince(gen, { kind: 'delete', userId, habitId, loggedDate, dayIndex });
}

export async function syncProfilePatch(userId: string, patch: ProfilePatch): Promise<boolean> {
  if (!canSync(userId)) return false;
  const gen = syncGeneration();
  if (!isOnline()) {
    enqueueProfile({ userId, patch });
    return false;
  }
  const ok = await trackInFlight(1, () => pushProfileRemote(userId, patch));
  if (!ok && gen === syncGeneration()) enqueueProfile({ userId, patch });
  return ok;
}

/** Delete many (habit, day) logs of one user in a single request. */
async function deleteHabitLogsRemote(
  userId: string,
  keys: Array<{ habitId: string; loggedDate: string }>
): Promise<boolean> {
  if (!canSync(userId) || !supabase || keys.length === 0) return keys.length === 0;
  try {
    const { error } = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .or(keys.map(({ habitId, loggedDate }) => `and(habit_id.eq.${habitId},logged_date.eq.${loggedDate})`).join(','));
    return !error;
  } catch {
    return false;
  }
}

/**
 * Upload queued habit logs: per user, one upsert for every completion and one
 * delete for every un-completion. If a batch fails (for example an older
 * schema without the (habit_id, logged_date) constraint) that user's rows
 * fall back to the per-row path with its schema fallbacks. Returns the items
 * that still could not be sent.
 */
async function flushHabitLogs(items: HabitLogQueueItem[]): Promise<HabitLogQueueItem[]> {
  const byUser = new Map<string, { upserts: HabitCompletionEvent[]; deletes: Array<{ habitId: string; loggedDate: string; dayIndex?: number }> }>();
  for (const item of items) {
    const group = byUser.get(item.userId) ?? { upserts: [], deletes: [] };
    if (item.kind === 'upsert') group.upserts.push(item.event);
    else {
      const del = resolveQueuedDelete(item);
      if (del) group.deletes.push(del);
    }
    byUser.set(item.userId, group);
  }

  const remaining: HabitLogQueueItem[] = [];
  for (const [userId, { upserts, deletes }] of byUser) {
    if (upserts.length > 0 && !(await pushHabitLogsRemote(userId, upserts))) {
      for (const event of upserts) {
        if (!(await pushHabitLogRemote(userId, event))) remaining.push({ kind: 'upsert', userId, event });
      }
    }
    if (deletes.length > 0 && !(await deleteHabitLogsRemote(userId, deletes))) {
      for (const del of deletes) {
        if (!(await pushHabitLogDeleteRemote(userId, del.habitId, del.loggedDate, del.dayIndex))) {
          remaining.push({ kind: 'delete', userId, ...del });
        }
      }
    }
  }
  return remaining;
}

export async function flushOfflineQueue(): Promise<void> {
  if (!isOnline() || !isSupabaseConfigured || !supabase) return;

  const gen = syncGeneration();
  const queuedLogs = readLogQueue();
  if (queuedLogs.length > 0) {
    writeLogQueue([]);
    // The queue is empty while these are sent: count them as in flight for sign-out.
    const remainingLogs = await trackInFlight(queuedLogs.length, () => flushHabitLogs(queuedLogs));
    // Keep anything queued while this flush was running. After a purge, drop the old user's leftovers.
    if (gen === syncGeneration()) writeLogQueue([...remainingLogs, ...readLogQueue()]);
  }

  const queuedProfiles = readJson<ProfileQueueItem[]>(PROFILE_QUEUE_KEY, []);
  if (queuedProfiles.length > 0) {
    const remainingProfiles = await trackInFlight(queuedProfiles.length, async () => {
      const remaining: ProfileQueueItem[] = [];
      for (const item of queuedProfiles) {
        if (!(await pushProfileRemote(item.userId, item.patch))) remaining.push(item);
      }
      return remaining;
    });
    if (gen === syncGeneration()) writeJson(PROFILE_QUEUE_KEY, remainingProfiles);
  }

  try {
    await flushMomentumEventQueue();
  } catch {
    // momentum_events table may not exist yet on older projects.
  }

  try {
    await flushChronicleQueue();
  } catch {
    // chronicle_entries may not exist yet on older projects.
  }

  try {
    await flushFeedbackQueue();
  } catch {
    // feedback may not exist yet on older projects.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ascend_offline_sync_completed'));
  }
}

/**
 * Writes not yet confirmed by Supabase: every offline queue plus requests in
 * flight. Sign-out keeps local data while this is above zero.
 */
export function unsyncedItemCount(): number {
  return (
    readLogQueue().length +
    readJson<ProfileQueueItem[]>(PROFILE_QUEUE_KEY, []).length +
    queuedMomentumEventCount() +
    queuedChronicleCount() +
    queuedFeedbackCount() +
    inFlightSyncCount()
  );
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
