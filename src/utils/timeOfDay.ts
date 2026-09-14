import { Habit } from '../types';
import { isTimeOfDay, type TimeOfDay } from '../types/habit';

export type { TimeOfDay };
export { isTimeOfDay };

export const BOWL_MODE_STORAGE_KEY = 'ascend_bowl_mode';

/** AM (0–11) = morning bowl, PM (12–23) = night bowl. */
export function inferBowlModeFromClock(date: Date = new Date()): TimeOfDay {
  return date.getHours() < 12 ? 'morning' : 'night';
}

export function inferTimeOfDayFromTimestamp(timestamp?: string | null): TimeOfDay {
  const raw = String(timestamp || '').trim().toLowerCase();
  if (!raw) return inferBowlModeFromClock();
  if (/\b(night|evening|tonight|pm|p\.m\.)\b/.test(raw)) return 'night';
  if (/\b(morning|sunrise|am|a\.m\.)\b/.test(raw)) return 'morning';
  const match = raw.match(/\b([01]?\d|2[0-3])(?::[0-5]\d)?\b/);
  if (match) {
    const hour = Number(match[1]);
    if (Number.isFinite(hour)) return hour >= 12 ? 'night' : 'morning';
  }
  return 'morning';
}

export function parseTimeOfDay(value: unknown, fallback?: string | null): TimeOfDay {
  if (isTimeOfDay(value)) return value;
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'am' || raw === 'day') return 'morning';
  if (raw === 'pm' || raw === 'evening') return 'night';
  return inferTimeOfDayFromTimestamp(fallback);
}

export function resolveHabitTimeOfDay(
  habit: Pick<Habit, 'timeOfDay' | 'timestamp'>
): TimeOfDay {
  if (isTimeOfDay(habit.timeOfDay)) return habit.timeOfDay;
  return inferTimeOfDayFromTimestamp(habit.timestamp);
}

export function hydrateHabitTimeOfDay<T extends Pick<Habit, 'timeOfDay' | 'timestamp'>>(habit: T): T {
  return { ...habit, timeOfDay: resolveHabitTimeOfDay(habit) };
}

export function habitsForTimeOfDay(habits: readonly Habit[], mode: TimeOfDay): Habit[] {
  return habits.filter((habit) => resolveHabitTimeOfDay(habit) === mode);
}

export function readStoredBowlMode(): TimeOfDay {
  try {
    const raw = localStorage.getItem(BOWL_MODE_STORAGE_KEY);
    if (isTimeOfDay(raw)) return raw;
  } catch {
    // private mode
  }
  return inferBowlModeFromClock();
}

export function persistBowlMode(mode: TimeOfDay): void {
  if (!isTimeOfDay(mode)) return;
  try {
    localStorage.setItem(BOWL_MODE_STORAGE_KEY, mode);
  } catch {
    // private mode
  }
}
