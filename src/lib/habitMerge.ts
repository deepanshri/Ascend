import { Habit } from '../types';
import { isSeedHabitId } from '../data/initialHabits';

/**
 * Pure habit merge rules. The set of habits deleted on this device is passed
 * in (habitsApi keeps it in storage), so these never touch storage.
 */

function habitRevision(habit: Habit): number {
  if (typeof habit.updatedAt === 'number' && Number.isFinite(habit.updatedAt)) {
    return habit.updatedAt;
  }
  return 0;
}

export function touchHabit<T extends Habit>(habit: T, at: number = Date.now()): T {
  return { ...habit, updatedAt: at };
}

function omitDeletedIds<T extends { id: string }>(items: T[], deleted: ReadonlySet<string>): T[] {
  return deleted.size === 0 ? items : items.filter((item) => !deleted.has(item.id));
}

export function omitDeletedRefs<T extends { habitId?: string }>(rows: T[], deleted: ReadonlySet<string>): T[] {
  return deleted.size === 0 ? rows : rows.filter((row) => !row.habitId || !deleted.has(row.habitId));
}

/** Last-write-wins by updatedAt. Equal timestamps keep the local (in-flight) row. */
export function mergeHabitRevisions(local: Habit[], remote: Habit[], deleted: ReadonlySet<string>): Habit[] {
  const localUser = omitDeletedIds(local.filter((habit) => !isSeedHabitId(habit.id)), deleted);
  const remoteUser = omitDeletedIds(remote.filter((habit) => !isSeedHabitId(habit.id)), deleted);
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
