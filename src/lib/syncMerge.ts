import { Habit } from '../types';
import { deletedHabitIdSet } from './habitsApi';
import { mergeHabitRevisions } from './habitMerge';

export { touchHabit } from './habitMerge';

/** Last-write-wins by updatedAt, skipping habits deleted on this device. */
export function mergeHabitsByUpdatedAt(local: Habit[], remote: Habit[]): Habit[] {
  return mergeHabitRevisions(local, remote, deletedHabitIdSet());
}

export { mergeRemindersByUpdatedAt } from '../providers/remindersState';
