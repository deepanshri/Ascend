import { Habit, StandaloneReminder } from '../types';
import { isSeedHabitId } from '../data/initialHabits';

function habitRevision(habit: Habit): number {
  if (typeof habit.updatedAt === 'number' && Number.isFinite(habit.updatedAt)) {
    return habit.updatedAt;
  }
  return 0;
}

export function touchHabit<T extends Habit>(habit: T, at: number = Date.now()): T {
  return { ...habit, updatedAt: at };
}

/** Last-write-wins by updatedAt. Equal timestamps keep the local (in-flight) row. */
export function mergeHabitsByUpdatedAt(local: Habit[], remote: Habit[]): Habit[] {
  const localUser = local.filter((habit) => !isSeedHabitId(habit.id));
  const remoteUser = remote.filter((habit) => !isSeedHabitId(habit.id));
  if (remoteUser.length === 0) return localUser;

  const merged = new Map<string, Habit>();
  remoteUser.forEach((habit) => merged.set(habit.id, habit));
  localUser.forEach((habit) => {
    const current = merged.get(habit.id);
    if (!current || habitRevision(habit) >= habitRevision(current)) {
      merged.set(habit.id, habit);
    }
  });
  return Array.from(merged.values());
}

function reminderRevision(item: StandaloneReminder): number {
  return item.updatedAt || item.createdAt || 0;
}

/** Last-write-wins by updatedAt. Equal timestamps keep the local (in-flight) row. */
export function mergeRemindersByUpdatedAt(
  local: StandaloneReminder[],
  incoming: StandaloneReminder[]
): StandaloneReminder[] {
  const merged = new Map<string, StandaloneReminder>();
  incoming.forEach((item) => merged.set(item.id, item));
  local.forEach((item) => {
    const current = merged.get(item.id);
    if (!current || reminderRevision(item) >= reminderRevision(current)) {
      merged.set(item.id, item);
    }
  });
  return Array.from(merged.values());
}
