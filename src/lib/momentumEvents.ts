import { MomentumEvent, MomentumEventType } from '../types';
import { isSeedHabitId } from '../data/initialHabits';
import { countMomentumCompletedActions, fetchSequentialMomentumEvents, insertMomentumEvent, isSupabaseConfigured, supabase } from './supabase';
import { parseToIsoDate, toISODate } from '../utils/dates';
import { isUuid, mergeMomentumEvents } from '../utils/momentum';
import { isTimeOfDay } from '../utils/timeOfDay';

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

export function loadLocalMomentumEvents(): MomentumEvent[] | null {
  try {
    const raw = localStorage.getItem(MOMENTUM_EVENTS_STORAGE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as MomentumEvent[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
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

function enqueue(item: MomentumQueueItem): void {
  const next = readQueue().filter((entry) => entry.event.id !== item.event.id);
  writeQueue([...next, item]);
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

/** COUNT(*) of full | fallback rows. Returns null when the table is unreachable. */
export async function fetchIdentityVoteCount(userId?: string | null): Promise<number | null> {
  return countMomentumCompletedActions(userId);
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

/** Insert-only. Never upserts or deletes historical rows. */
export async function appendMomentumEventRemote(
  userId: string | null | undefined,
  event: MomentumEvent
): Promise<void> {
  if (!canSync(userId) || !userId || isSeedHabitId(event.habitId)) return;
  if (!isOnline()) {
    enqueue({ userId, event });
    return;
  }
  const ok = await insertMomentumEventRemote(userId, event);
  if (!ok) enqueue({ userId, event });
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

  if (!isOnline()) {
    for (const event of filtered) enqueue({ userId, event });
    return false;
  }

  const rawRows = filtered.map((e) => toMomentumEventRow(userId, e));
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
      for (const event of filtered) enqueue({ userId, event });
      return false;
    }
    return true;
  } catch {
    for (const event of filtered) enqueue({ userId, event });
    return false;
  }
}

export async function flushMomentumEventQueue(): Promise<void> {
  if (!isOnline() || !isSupabaseConfigured || !supabase) return;
  const remaining: MomentumQueueItem[] = [];
  for (const item of readQueue()) {
    if (isSeedHabitId(item.event.habitId)) continue;
    const ok = await insertMomentumEventRemote(item.userId, item.event);
    if (!ok) remaining.push(item);
  }
  writeQueue(remaining);
}

export function mergeFetchedMomentumEvents(
  local: MomentumEvent[],
  remote: MomentumEvent[]
): MomentumEvent[] {
  return mergeMomentumEvents(local, remote);
}
