import { HabitCompletionEvent } from '../types';
import { isSeedHabitId } from '../data/initialHabits';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { syncHabitLogDelete, syncHabitLogUpsert, syncHabitLogUpserts } from '../lib/offlineSync';
import { mapHabitLogRowToEvent, type HabitLogRow } from './momentumCore';

export * from './momentumCore';

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
      .filter((event): event is HabitCompletionEvent => event !== null && !isSeedHabitId(event.habitId));
  } catch (err) {
    console.warn('habit_logs fetch offline:', err);
    return [];
  }
}

/** Upsert many habit logs in one request; seed-habit rows are skipped. */
export async function upsertHabitLogs(
  userId: string | null | undefined,
  events: HabitCompletionEvent[]
): Promise<void> {
  await syncHabitLogUpserts(userId, events.filter((event) => !isSeedHabitId(event.habitId)));
}

export async function upsertHabitLog(
  userId: string | null | undefined,
  event: HabitCompletionEvent
): Promise<void> {
  if (isSeedHabitId(event.habitId)) return;
  await syncHabitLogUpsert(userId, event);
}

export async function deleteHabitLog(
  userId: string | null | undefined,
  habitId: string,
  loggedDate: string,
  dayIndex?: number
): Promise<void> {
  await syncHabitLogDelete(userId, habitId, loggedDate, dayIndex);
}
