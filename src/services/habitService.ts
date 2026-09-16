import { deleteHabitCascade, rememberDeletedHabit } from '../lib/habitsApi';

export {
  BOWL_MODE_STORAGE_KEY,
  habitsForTimeOfDay,
  hydrateHabitTimeOfDay,
  inferBowlModeFromClock,
  inferTimeOfDayFromTimestamp,
  isTimeOfDay,
  parseTimeOfDay,
  persistBowlMode,
  readStoredBowlMode,
  resolveHabitTimeOfDay,
  type TimeOfDay,
} from '../utils/timeOfDay';

/**
 * Stable daily habit_log identity for Supabase UPSERT on (habit_id, logged_date).
 * Re-checking the same habit the same day replaces the row instead of stacking.
 */
export function stableHabitLogId(habitId: string, loggedDate: string): string {
  const seed = `${habitId}:${loggedDate}`;
  // Deterministic UUID-shaped id from FNV-1a so Postgres uuid columns accept it.
  const chunk = (label: string) => {
    let hash = 2166136261;
    const input = `${label}:${seed}`;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  const h1 = chunk('a');
  const h2 = chunk('b');
  const h3 = chunk('c');
  const h4 = chunk('d');
  return `${h1.slice(0, 8)}-${h2.slice(0, 4)}-4${h2.slice(4, 7)}-a${h3.slice(0, 3)}-${h3.slice(3, 7)}${h4.slice(0, 8)}`;
}

/** Permanent habit delete: habits + logs + momentum_events (+ glows via RPC). */
export async function deleteHabit(userId: string | null | undefined, habitId: string): Promise<void> {
  rememberDeletedHabit(habitId);
  await deleteHabitCascade(userId, habitId);
}

export { deleteHabitCascade };
