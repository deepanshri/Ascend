import { MomentumEvent, MomentumEventType } from '../types';
import { isSeedHabitId } from '../data/initialHabits';
import { fetchSequentialMomentumEvents, insertMomentumEvent, isSupabaseConfigured, supabase } from './supabase';
import { parseToIsoDate, toISODate } from '../utils/dates';
import { isUuid } from '../utils/momentum';
import { isTimeOfDay } from '../utils/timeOfDay';
import { readJson, writeJson } from './storage';
import { syncGeneration, trackInFlight } from './syncState';
import { remapLegacyMomentumIds, remapLegacyMomentumIdsBy } from '../utils/momentumIds';

export const MOMENTUM_EVENTS_STORAGE_KEY = 'ascend_momentum_events';
const MOMENTUM_QUEUE_KEY = 'ascend_offline_momentum_event_queue';

export interface MomentumEventRow {
  id?: string;
  user_id?: string;
  habit_id?: string;
  event_type?: string;
  weight?: number | string;
  timestamp?: string | number;
  time_of_day?: string | null;
}

interface MomentumQueueItem {
  userId: string;
  event: MomentumEvent;
}

function canSync(userId?: string | null): boolean {
  return Boolean(isSupabaseConfigured && supabase && userId && isUuid(userId) && !userId.startsWith('guest_'));
}

function isOnline(): boolean {
  try {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  } catch {
    return true;
  }
}

export function saveLocalMomentumEvents(events: MomentumEvent[]): void {
  writeJson(MOMENTUM_EVENTS_STORAGE_KEY, events);
}

function readQueue(): MomentumQueueItem[] {
  return readJson<MomentumQueueItem[]>(MOMENTUM_QUEUE_KEY, []);
}

function writeQueue(items: MomentumQueueItem[]): void {
  writeJson(MOMENTUM_QUEUE_KEY, items);
}

/** Queue events unless local user data was purged since generation `gen` (sign-out, account switch). */
function enqueueSince(gen: number, userId: string, events: MomentumEvent[]): void {
  if (gen !== syncGeneration() || events.length === 0) return;
  const ids = new Set(events.map((event) => event.id));
  writeQueue([...readQueue().filter((entry) => !ids.has(entry.event.id)), ...events.map((event) => ({ userId, event }))]);
}

export function queuedMomentumEventCount(): number {
  return readQueue().length;
}

function parseEventType(raw: string | undefined): MomentumEventType | null {
  const value = String(raw || '').toLowerCase();
  if (value === 'full' || value === 'fallback' || value === 'missed' || value === 'reversal') return value;
  if (value.includes('revers') || value.includes('undo') || value.includes('reset')) return 'reversal';
  if (value.includes('micro') || value.includes('fallback')) return 'fallback';
  if (value.includes('miss')) return 'missed';
  if (value === 'complete' || value === 'completed') return 'full';
  return null;
}

export function mapMomentumEventRow(row: MomentumEventRow): MomentumEvent | null {
  const id = row.id;
  const habitId = row.habit_id;
  const eventType = parseEventType(row.event_type);
  const weight = Number(row.weight);
  if (!id || !habitId || !eventType || !Number.isFinite(weight)) return null;

  let timestamp = Date.now();
  if (typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)) {
    timestamp = row.timestamp;
  } else if (typeof row.timestamp === 'string') {
    const parsed = Date.parse(row.timestamp);
    if (!Number.isNaN(parsed)) timestamp = parsed;
  }

  return {
    id: String(id),
    habitId: String(habitId),
    eventType,
    weight,
    timestamp,
    loggedDate: parseToIsoDate(typeof row.timestamp === 'string' ? row.timestamp : toISODate(new Date(timestamp))),
    timeOfDay: isTimeOfDay(row.time_of_day) ? row.time_of_day : undefined,
  };
}

export function toMomentumEventRow(userId: string, event: MomentumEvent) {
  return {
    id: event.id,
    user_id: userId,
    habit_id: event.habitId,
    event_type: event.eventType,
    weight: event.weight,
    timestamp: new Date(event.timestamp).toISOString(),
    time_of_day: isTimeOfDay(event.timeOfDay) ? event.timeOfDay : null,
  };
}

export async function fetchMomentumEventsFromTable(userId?: string | null): Promise<MomentumEvent[]> {
  const rows = await fetchSequentialMomentumEvents(userId);
  return rows
    .map((row) =>
      mapMomentumEventRow({
        id: row.id,
        user_id: row.userId,
        habit_id: row.habitId,
        event_type: row.eventType,
        weight: row.weight,
        timestamp: row.timestamp,
        time_of_day: row.timeOfDay,
      })
    )
    .filter((event): event is MomentumEvent => event !== null && !isSeedHabitId(event.habitId));
}

async function insertMomentumEventRemote(userId: string, event: MomentumEvent): Promise<boolean> {
  if (!canSync(userId)) return false;
  return insertMomentumEvent({
    id: event.id,
    userId,
    habitId: event.habitId,
    eventType: event.eventType,
    weight: event.weight,
    timestamp: event.timestamp,
    timeOfDay: event.timeOfDay,
  });
}

/**
 * Append many events in one request: pushMomentumEventsRemote sends a single
 * INSERT ... ON CONFLICT (id) DO NOTHING, so stored rows are skipped and never
 * updated. Offline or on failure the events join the offline queue.
 */
export async function appendMomentumEventsRemote(
  userId: string | null | undefined,
  events: MomentumEvent[]
): Promise<void> {
  await pushMomentumEventsRemote(userId, events);
}

/** Insert-only. Never upserts or deletes historical rows. */
export async function appendMomentumEventRemote(
  userId: string | null | undefined,
  event: MomentumEvent
): Promise<void> {
  if (!canSync(userId) || !userId || isSeedHabitId(event.habitId)) return;
  const gen = syncGeneration();
  if (!isOnline()) {
    enqueueSince(gen, userId, [event]);
    return;
  }
  const ok = await trackInFlight(1, () => insertMomentumEventRemote(userId, event));
  if (!ok) enqueueSince(gen, userId, [event]);
}

let supportsTimeOfDayColumn = true;

export async function pushMomentumEventsRemote(
  userId: string | null | undefined,
  events: MomentumEvent[]
): Promise<boolean> {
  if (!canSync(userId) || !userId || !supabase) return false;
  if (events.length === 0) return true;
  const filtered = events.filter((event) => !isSeedHabitId(event.habitId) && isUuid(event.id));
  if (filtered.length === 0) return true;

  const gen = syncGeneration();
  if (!isOnline()) {
    enqueueSince(gen, userId, filtered);
    return false;
  }

  const ok = await trackInFlight(filtered.length, () => insertMomentumRows(userId, filtered));
  if (!ok) enqueueSince(gen, userId, filtered);
  return ok;
}

async function insertMomentumRows(userId: string, events: MomentumEvent[]): Promise<boolean> {
  if (!supabase) return false;
  const rawRows = events.map((e) => toMomentumEventRow(userId, e));
  const rows = supportsTimeOfDayColumn
    ? rawRows
    : rawRows.map(({ time_of_day: _t, ...core }) => core);

  try {
    let { error } = await supabase.from('momentum_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error && /time_of_day/i.test(error.message)) {
      supportsTimeOfDayColumn = false;
      const coreRows = rawRows.map(({ time_of_day: _t, ...core }) => core);
      const retry = await supabase.from('momentum_events').upsert(coreRows, { onConflict: 'id', ignoreDuplicates: true });
      error = retry.error;
    }
    if (error) {
      console.warn('Batch momentum events push note:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function flushMomentumEventQueue(): Promise<void> {
  if (!isOnline() || !isSupabaseConfigured || !supabase) return;
  const queued = readQueue();
  if (queued.length === 0) return;
  // One batch request per user (normally one); failures re-queue themselves.
  writeQueue([]);
  const byUser = new Map<string, MomentumEvent[]>();
  for (const item of queued) {
    if (isSeedHabitId(item.event.habitId)) continue;
    byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item.event]);
  }
  // Started together, so every emptied-out event is counted in flight at once.
  await Promise.all([...byUser].map(([userId, events]) => pushMomentumEventsRemote(userId, events)));
}

const isStoredEvent = (value: unknown): value is MomentumEvent =>
  Boolean(value) && typeof value === 'object' && typeof (value as MomentumEvent).id === 'string' &&
  typeof (value as MomentumEvent).habitId === 'string';

/**
 * Idempotent migration: legacy `evt_` ids in the stored momentum log and the
 * offline queue become stable UUIDs, so the queue and account sync can upload
 * them. Malformed entries are left in place for the loaders to dead-letter.
 */
export function migrateLegacyMomentumIds(): void {
  const log = readJson<unknown>(MOMENTUM_EVENTS_STORAGE_KEY, null);
  if (Array.isArray(log)) {
    const { events, remapped, dropped } = remapLegacyMomentumIds(log.filter(isStoredEvent));
    if (remapped + dropped > 0) {
      writeJson(MOMENTUM_EVENTS_STORAGE_KEY, [...events, ...log.filter((entry) => !isStoredEvent(entry))]);
    }
  }
  const queue = readJson<unknown>(MOMENTUM_QUEUE_KEY, null);
  if (Array.isArray(queue)) {
    const isItem = (value: unknown): value is MomentumQueueItem =>
      Boolean(value) && typeof value === 'object' && isStoredEvent((value as MomentumQueueItem).event);
    const { items, remapped, dropped } = remapLegacyMomentumIdsBy(
      queue.filter(isItem),
      (item) => item.event,
      (item, event) => ({ ...item, event })
    );
    if (remapped + dropped > 0) writeQueue([...items, ...queue.filter((entry) => !isItem(entry))]);
  }
}
