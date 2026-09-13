import { Habit } from '../types';
import { getWeekDates, parseIsoDateParts } from './dates';

/** Monday-first weekday chips: 0 = Mon … 6 = Sun. */
export const WEEKDAY_CHIP_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function weekdayMon0FromDate(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function weekdayMon0FromIso(iso: string): number {
  const parts = parseIsoDateParts(iso);
  if (!parts) return weekdayMon0FromDate(new Date());
  return weekdayMon0FromDate(new Date(parts.year, parts.month - 1, parts.day));
}

export function weekdayMon0FromDayIndex(dayIndex: number, origin: Date = new Date()): number {
  return weekdayMon0FromDate(getWeekDates(origin)[dayIndex] ?? origin);
}

/** Empty / missing schedule = every day (least disruptive default for existing habits). */
export function normalizeScheduledDays(days?: number[] | null): number[] {
  if (!days || days.length === 0) return [...ALL_WEEKDAYS];
  const unique = [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort(
    (a, b) => a - b
  );
  return unique.length === 0 ? [...ALL_WEEKDAYS] : unique;
}

export function scheduleTypeFromDays(days: number[]): Habit['scheduleType'] {
  return days.length === 7 ? 'daily' : 'specific_days';
}

export function isHabitScheduledOnWeekday(
  habit: Pick<Habit, 'scheduledDays'>,
  weekdayMon0: number
): boolean {
  return normalizeScheduledDays(habit.scheduledDays).includes(weekdayMon0);
}

export function isHabitScheduledOnDayIndex(
  habit: Pick<Habit, 'scheduledDays'>,
  dayIndex: number,
  origin: Date = new Date()
): boolean {
  return isHabitScheduledOnWeekday(habit, weekdayMon0FromDayIndex(dayIndex, origin));
}

export function isHabitScheduledOnIso(habit: Pick<Habit, 'scheduledDays'>, iso: string): boolean {
  return isHabitScheduledOnWeekday(habit, weekdayMon0FromIso(iso));
}

export function scheduledHabitsForDayIndex(
  habits: Habit[],
  dayIndex: number,
  origin: Date = new Date()
): Habit[] {
  return habits.filter((habit) => !habit.archived && isHabitScheduledOnDayIndex(habit, dayIndex, origin));
}
