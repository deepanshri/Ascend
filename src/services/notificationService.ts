/** Compact single-line notification / toast copy. */

import { Habit } from '../types';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';

export function reminderPromptCopy(habitName: string): string {
  const name = habitName.trim() || 'your habit';
  return `Are you ready for "${name}"?`;
}

export function completionConfirmCopy(habitName: string): string {
  const name = habitName.trim() || 'your habit';
  return `Completed "${name}"?`;
}

export function compactNotificationPair(habitName: string): { title: string; body: string } {
  const title = reminderPromptCopy(habitName);
  return { title, body: title };
}

/** Swipe/toast alerts only fire on scheduled days — off-day toggles stay silent. */
export function shouldNotifyHabitSwipe(
  habit: Pick<Habit, 'scheduledDays'>,
  dayIndex: number,
  origin: Date = new Date()
): boolean {
  return isHabitScheduledOnDayIndex(habit, dayIndex, origin);
}
