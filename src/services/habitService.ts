import { stableUuid } from '../utils/stableId';

export { deleteHabit } from '../lib/habitsApi';

/**
 * Stable daily habit_log identity for Supabase UPSERT on (habit_id, logged_date).
 * Re-checking the same habit the same day replaces the row instead of stacking.
 */
export function stableHabitLogId(habitId: string, loggedDate: string): string {
  return stableUuid(`${habitId}:${loggedDate}`);
}
