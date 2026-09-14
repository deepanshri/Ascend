import { deleteHabitCascade, rememberDeletedHabit } from '../lib/habitsApi';

/** Permanent habit delete: drops the habits row and associated habit_logs. */
export async function deleteHabit(userId: string | null | undefined, habitId: string): Promise<void> {
  rememberDeletedHabit(habitId);
  await deleteHabitCascade(userId, habitId);
}

export { deleteHabitCascade };
