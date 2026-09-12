import { Habit, HabitCompletionEvent, CompletionType } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  dayIndexForIso,
  getTodayDayIndex,
  getWeekDates,
  parseToIsoDate,
  resolveEventIsoDate,
  toISODate,
} from './dates';
import { syncHabitLogDelete, syncHabitLogUpsert } from '../lib/offlineSync';

export const WORK_HABIT_WEIGHT = 1.5;
export const SELF_IMPROVEMENT_HABIT_WEIGHT = 1.0;
export const FULL_COMPLETION_VALUE = 1.0;
export const FALLBACK_COMPLETION_VALUE = 0.5;
export const MISSED_COMPLETION_VALUE = 0.0;

export interface HabitLogRow {
  id?: string;
  user_id?: string;
  habit_id?: string;
  habitId?: string;
  day_index?: number;
  dayIndex?: number;
  date?: string;
  logged_on?: string;
  logged_date?: string;
  completed_at?: string;
  type?: string;
  completion_type?: string;
  note?: string;
  completion?: number;
  value?: number;
  timestamp?: number | string;
  created_at?: string;
}

/** Category priority weights: Work (W) = 1.5, Self Improvement (SI) = 1.0. */
export function habitWeight(habit: Habit): number {
  return habit.category === 'work' ? WORK_HABIT_WEIGHT : SELF_IMPROVEMENT_HABIT_WEIGHT;
}

/** Full swipe = 1.0, fallback swipe = 0.5, unlogged/missed = 0.0. */
export function completionValueForHabit(habit: Habit, dayIndex: number): number {
  if (!habit.days?.[dayIndex]) return MISSED_COMPLETION_VALUE;
  if (habit.microDays?.[dayIndex]) return FALLBACK_COMPLETION_VALUE;
  return FULL_COMPLETION_VALUE;
}

function resolveDayIndex(row: HabitLogRow, origin: Date = new Date()): number {
  const iso = parseToIsoDate(row.logged_date || row.date || row.logged_on || row.completed_at);
  if (iso) {
    const mapped = dayIndexForIso(iso, origin);
    if (mapped >= 0) return mapped;
  }

  const explicit = row.day_index ?? row.dayIndex;
  if (explicit !== undefined && explicit !== null && Number.isFinite(Number(explicit))) {
    return Number(explicit);
  }

  return getTodayDayIndex();
}

function resolveCompletionType(row: HabitLogRow): CompletionType {
  const numeric = Number(row.completion ?? row.value);
  if (Number.isFinite(numeric) && numeric > 0 && numeric < 1) {
    return 'fallback_micro';
  }

  const raw = String(row.type || row.completion_type || 'full').toLowerCase();
  if (raw.includes('micro') || raw.includes('fallback') || raw === '0.5' || raw === 'partial') {
    return 'fallback_micro';
  }
  return 'full';
}

export function mapHabitLogRowToEvent(row: HabitLogRow, origin: Date = new Date()): HabitCompletionEvent | null {
  const habitId = row.habit_id || row.habitId;
  if (!habitId) return null;

  const dayIndex = resolveDayIndex(row, origin);
  const isoDate =
    parseToIsoDate(row.logged_date || row.date || row.logged_on || row.completed_at) ||
    toISODate(getWeekDates(origin)[dayIndex] ?? origin);
  const timestampRaw = row.timestamp ?? row.created_at ?? row.completed_at;
  let timestamp = Date.now();
  if (typeof timestampRaw === 'number') {
    timestamp = timestampRaw;
  } else if (typeof timestampRaw === 'string') {
    const parsed = Date.parse(timestampRaw);
    if (!Number.isNaN(parsed)) timestamp = parsed;
  }

  return {
    id: String(row.id || `log-${habitId}-${isoDate}`),
    habitId: String(habitId),
    dayIndex,
    date: isoDate,
    type: resolveCompletionType(row),
    note: row.note || undefined,
    timestamp,
  };
}

export function mergeCompletionEvents(
  local: HabitCompletionEvent[],
  remote: HabitCompletionEvent[],
  origin: Date = new Date()
): HabitCompletionEvent[] {
  const byKey = new Map<string, HabitCompletionEvent>();

  const put = (event: HabitCompletionEvent) => {
    const key = `${event.habitId}:${resolveEventIsoDate(event, origin)}`;
    const existing = byKey.get(key);
    if (!existing || event.timestamp >= existing.timestamp) {
      byKey.set(key, event);
    }
  };

  local.forEach(put);
  remote.forEach(put);
  return Array.from(byKey.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Reads the append-only `habit_logs` table and maps rows into completion events.
 * Guest / offline sessions return an empty list so local logs remain ground truth.
 */
export async function fetchHabitLogsFromTable(userId?: string | null): Promise<HabitCompletionEvent[]> {
  if (!isSupabaseConfigured || !supabase || !userId || userId.startsWith('guest_')) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.warn('habit_logs fetch failed:', error.message);
      return [];
    }

    if (!data) {
      return [];
    }

    return (data as HabitLogRow[])
      .map((row) => mapHabitLogRowToEvent(row))
      .filter((event): event is HabitCompletionEvent => event !== null);
  } catch (err) {
    console.warn('habit_logs fetch offline:', err);
    return [];
  }
}

export async function upsertHabitLog(
  userId: string | null | undefined,
  event: HabitCompletionEvent
): Promise<void> {
  await syncHabitLogUpsert(userId, event);
}

export async function deleteHabitLog(
  userId: string | null | undefined,
  habitId: string,
  dayIndex: number = getTodayDayIndex()
): Promise<void> {
  await syncHabitLogDelete(userId, habitId, dayIndex);
}

/**
 * Replays the immutable append-only event log (local + habit_logs) to reconstruct
 * the habit's weekly projection (days, microDays) against the rolling 7-day window.
 * Events are placed by logged ISO date so midnight rollover cannot rewrite today.
 */
export function deriveHabitsFromEventLog(
  habits: Habit[],
  events: HabitCompletionEvent[],
  origin: Date = new Date()
): Habit[] {
  const weekIso = getWeekDates(origin).map((date) => toISODate(date));

  return habits.map((habit) => {
    const days = [false, false, false, false, false, false, false];
    const microDays = [false, false, false, false, false, false, false];

    const habitEvents = events.filter((e) => e.habitId === habit.id);
    for (const ev of habitEvents) {
      const iso = resolveEventIsoDate(ev, origin);
      const dayIndex = weekIso.indexOf(iso);
      if (dayIndex < 0) continue;
      days[dayIndex] = true;
      if (ev.type === 'fallback_micro') {
        microDays[dayIndex] = true;
      }
    }

    return {
      ...habit,
      days,
      microDays,
    };
  });
}

/**
 * Priority-weighted momentum (0–100):
 * Work (W) weight 1.5, Self Improvement (SI) weight 1.0.
 * Completion: full swipe = 1.0, fallback swipe = 0.5, unlogged/missed = 0.0.
 * Score = (Σ(habit_weight × completion_value) / Σ habit_weights) × 100.
 * Exam Shield omits missed habits from the denominator so momentum does not decay.
 */
export function calculateMomentumScore(
  habits: Habit[],
  dayIndex: number = 3,
  examShield: boolean = false,
  logs?: HabitCompletionEvent[],
  origin: Date = new Date()
): number {
  const scoredHabits =
    logs && logs.length > 0 ? deriveHabitsFromEventLog(habits, logs, origin) : habits;
  const activeHabits = scoredHabits.filter((h) => !h.archived);
  if (activeHabits.length === 0) return 0;

  const scheduled = activeHabits.filter(
    (h) => !h.scheduledDays || h.scheduledDays.includes(dayIndex)
  );
  const pool = scheduled.length > 0 ? scheduled : activeHabits;

  let weightedSum = 0;
  let weightTotal = 0;

  pool.forEach((habit) => {
    const weight = habitWeight(habit);
    const value = completionValueForHabit(habit, dayIndex);
    if (examShield && value === MISSED_COMPLETION_VALUE) return;
    weightedSum += weight * value;
    weightTotal += weight;
  });

  if (weightTotal <= 0) return examShield ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((weightedSum / weightTotal) * 100)));
}
