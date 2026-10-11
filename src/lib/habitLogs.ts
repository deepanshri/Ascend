import type { HabitCompletionEvent } from '../types';

/** Completion row as it may arrive from storage or Supabase (camelCase or snake_case). */
type CompletionLogRow = HabitCompletionEvent & { habit_id?: string; logged_date?: string };

/** Whether `log` records `habitId` on `isoDate`, accepting legacy snake_case fields. */
export function isLoggedOn(log: HabitCompletionEvent, habitId: string, isoDate: string): boolean {
  const row = log as CompletionLogRow;
  return (
    (row.habitId === habitId || row.habit_id === habitId) &&
    (row.date === isoDate || row.logged_date === isoDate)
  );
}

export function hasLogOn(logs: HabitCompletionEvent[], habitId: string, isoDate: string): boolean {
  return logs.some((log) => isLoggedOn(log, habitId, isoDate));
}
