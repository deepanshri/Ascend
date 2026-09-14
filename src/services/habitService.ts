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

/** Permanent habit delete: drops the habits row and associated habit_logs. */
export async function deleteHabit(userId: string | null | undefined, habitId: string): Promise<void> {
  rememberDeletedHabit(habitId);
  await deleteHabitCascade(userId, habitId);
}

export { deleteHabitCascade };
