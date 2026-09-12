import { Habit, HabitCompletionEvent, CompletionType } from '../types';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { getTodayDayIndex } from './dates';

export interface HabitLogRow {
  id?: string;
  user_id?: string;
  habit_id?: string;
  habitId?: string;
  day_index?: number;
  dayIndex?: number;
  date?: string;
  logged_on?: string;
  completed_at?: string;
  type?: string;
  completion_type?: string;
  note?: string;
  timestamp?: number | string;
  created_at?: string;
}

function resolveDayIndex(row: HabitLogRow): number {
  const explicit = row.day_index ?? row.dayIndex;
  if (explicit !== undefined && explicit !== null && Number.isFinite(Number(explicit))) {
    return Number(explicit);
  }

  const dateStr = row.date || row.logged_on || row.completed_at;
  if (dateStr) {
    const logged = new Date(dateStr);
    if (!Number.isNaN(logged.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      logged.setHours(0, 0, 0, 0);
      const diffDays = Math.round((logged.getTime() - today.getTime()) / 86400000);
      const mapped = getTodayDayIndex() + diffDays;
      if (mapped >= 0 && mapped < 7) return mapped;
    }
  }

  return getTodayDayIndex();
}

function resolveCompletionType(row: HabitLogRow): CompletionType {
  const raw = String(row.type || row.completion_type || 'full').toLowerCase();
  if (raw.includes('micro') || raw.includes('fallback') || raw === '0.5' || raw === 'partial') {
    return 'fallback_micro';
  }
  return 'full';
}

export function mapHabitLogRowToEvent(row: HabitLogRow): HabitCompletionEvent | null {
  const habitId = row.habit_id || row.habitId;
  if (!habitId) return null;

  const dayIndex = resolveDayIndex(row);
  const timestampRaw = row.timestamp ?? row.created_at ?? row.completed_at;
  let timestamp = Date.now();
  if (typeof timestampRaw === 'number') {
    timestamp = timestampRaw;
  } else if (typeof timestampRaw === 'string') {
    const parsed = Date.parse(timestampRaw);
    if (!Number.isNaN(parsed)) timestamp = parsed;
  }

  return {
    id: String(row.id || `log-${habitId}-${dayIndex}`),
    habitId: String(habitId),
    dayIndex,
    date: String(row.date || row.logged_on || row.completed_at || ''),
    type: resolveCompletionType(row),
    note: row.note || undefined,
    timestamp,
  };
}

export function mergeCompletionEvents(
  local: HabitCompletionEvent[],
  remote: HabitCompletionEvent[]
): HabitCompletionEvent[] {
  const byKey = new Map<string, HabitCompletionEvent>();

  const put = (event: HabitCompletionEvent) => {
    const key = `${event.habitId}:${event.dayIndex}`;
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

    if (error || !data) {
      return [];
    }

    return (data as HabitLogRow[])
      .map(mapHabitLogRowToEvent)
      .filter((event): event is HabitCompletionEvent => event !== null);
  } catch {
    return [];
  }
}

export async function upsertHabitLog(
  userId: string | null | undefined,
  event: HabitCompletionEvent
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !userId || userId.startsWith('guest_')) {
    return;
  }

  try {
    await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', event.habitId)
      .eq('day_index', event.dayIndex);

    await supabase.from('habit_logs').insert({
      id: event.id,
      user_id: userId,
      habit_id: event.habitId,
      day_index: event.dayIndex,
      date: event.date,
      type: event.type,
      note: event.note || null,
      timestamp: event.timestamp,
    });
  } catch {
    // Completions still persist locally if the remote table is unavailable.
  }
}

export async function deleteHabitLog(
  userId: string | null | undefined,
  habitId: string,
  dayIndex: number = getTodayDayIndex()
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !userId || userId.startsWith('guest_')) {
    return;
  }

  try {
    await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('day_index', dayIndex);
  } catch {}
}

/**
 * Replays the immutable append-only event log (local + habit_logs) to reconstruct
 * the habit's weekly projection (days, microDays).
 * This guarantees that past days cannot be retroactively modified or gamed.
 */
export function deriveHabitsFromEventLog(
  habits: Habit[],
  events: HabitCompletionEvent[],
  todayIndex: number = getTodayDayIndex()
): Habit[] {
  return habits.map((habit) => {
    const days = [false, false, false, false, false, false, false];
    const microDays = [false, false, false, false, false, false, false];

    // Replay all events recorded for this habit
    const habitEvents = events.filter((e) => e.habitId === habit.id);
    for (const ev of habitEvents) {
      if (ev.dayIndex >= 0 && ev.dayIndex < 7) {
        days[ev.dayIndex] = true;
        if (ev.type === 'fallback_micro') {
          microDays[ev.dayIndex] = true;
        }
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
 * Ascend Momentum Formula:
 * - 100% credit for full completions (1.0)
 * - 50% credit for micro-habit fallbacks (0.5)
 * - Decay mechanism: Missed days gently decay momentum (e.g. 10-15%) rather than zero-reset drop
 * - Ground truth is the completion log (habit_logs + local events), replayed onto habits
 */
export function calculateMomentumScore(
  habits: Habit[],
  dayIndex: number = 3,
  examShield: boolean = false,
  logs?: HabitCompletionEvent[]
): number {
  const scoredHabits =
    logs && logs.length > 0 ? deriveHabitsFromEventLog(habits, logs, dayIndex) : habits;
  const activeHabits = scoredHabits.filter((h) => !h.archived);
  if (!activeHabits || activeHabits.length === 0) return 0;

  // 1. Today's execution rate (50% for fallback micro-habits, 100% for full)
  let todayPoints = 0;
  let scheduledTodayCount = 0;

  activeHabits.forEach((h) => {
    // Check if habit is scheduled for this day
    const isScheduled = !h.scheduledDays || h.scheduledDays.includes(dayIndex);
    if (isScheduled) {
      scheduledTodayCount += 1;
    }

    const isDone = h.days?.[dayIndex] ?? false;
    const isMicro = h.microDays?.[dayIndex] ?? false;
    if (isDone) {
      // 50% partial credit for fallback micro-habit, 100% for full completion
      todayPoints += isMicro ? 0.5 : 1.0;
    }
  });

  const effectiveTodayTotal = scheduledTodayCount > 0 ? scheduledTodayCount : activeHabits.length;
  const todayRatio = Math.min(1, todayPoints / effectiveTodayTotal);

  // 2. Recent 7-day consistency with gentle decay for missed days
  let totalCompletions = 0;
  let totalPossible = 0;
  let consecutiveMisses = 0;

  activeHabits.forEach((h) => {
    h.days.forEach((done, dIdx) => {
      totalPossible += 1;
      if (done) {
        const isMicro = h.microDays?.[dIdx] ?? false;
        totalCompletions += isMicro ? 0.5 : 1.0;
      }
    });

    // Check if today was missed to compute decay
    if (!h.days?.[dayIndex]) {
      consecutiveMisses += 1;
    }
  });

  const weeklyRatio = totalPossible > 0 ? totalCompletions / totalPossible : 0;

  // 3. Gentle decay factor: each missed habit today applies a tiny 2% decay factor (max 15% decay)
  // Ensures momentum never drops to 0 immediately
  // If Exam Shield / Vacation Mode is active, decay is frozen (decayFactor = 1.0)
  const missRatio = activeHabits.length > 0 ? consecutiveMisses / activeHabits.length : 0;
  const decayFactor = examShield ? 1.0 : 1 - Math.min(0.15, missRatio * 0.15);

  // 4. Consistency momentum & identity foundation
  const consistencyBonus = weeklyRatio * 15;
  const baseFoundation = todayRatio > 0 ? 20 : 10;

  const rawScore = (baseFoundation + todayRatio * 45 + weeklyRatio * 20 + consistencyBonus) * decayFactor;

  return Math.min(100, Math.max(0, Math.round(rawScore)));
}
