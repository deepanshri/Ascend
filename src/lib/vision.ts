import type { Habit, HabitCompletionEvent } from '../types';
import { addDaysIso, resolveEventIsoDate } from '../utils/dates';
import { isHabitScheduledOnIso } from '../utils/schedule';

export interface ThreeDayCompletionRateResult {
  completionRate: number;
  totalScheduled: number;
  totalCompleted: number;
}

/**
 * Calculates habit completion rate across the past 3 full days (T-1, T-2, T-3).
 *
 * @param completionEvents Completion logs
 * @param habits Active habit definitions
 * @param todayIso YYYY-MM-DD string for current local date
 * @returns { completionRate, totalScheduled, totalCompleted }
 */
export function calculateThreeDayCompletionRate(
  completionEvents: HabitCompletionEvent[] = [],
  habits: Habit[] = [],
  todayIso: string
): ThreeDayCompletionRateResult {
  const activeHabits = habits.filter((h) => !h.archived);
  const targetDays = [
    addDaysIso(todayIso, -1),
    addDaysIso(todayIso, -2),
    addDaysIso(todayIso, -3),
  ];

  let totalScheduled = 0;
  let totalCompleted = 0;

  for (const dateIso of targetDays) {
    const scheduledHabits = activeHabits.filter((h) => isHabitScheduledOnIso(h, dateIso));
    totalScheduled += scheduledHabits.length;

    const scheduledIdSet = new Set(scheduledHabits.map((h) => h.id));
    const completedHabitIds = new Set<string>();

    for (const event of completionEvents) {
      if (scheduledIdSet.has(event.habitId) && resolveEventIsoDate(event) === dateIso) {
        completedHabitIds.add(event.habitId);
      }
    }

    totalCompleted += completedHabitIds.size;
  }

  const completionRate = totalScheduled > 0 ? totalCompleted / totalScheduled : 1;

  return {
    completionRate,
    totalScheduled,
    totalCompleted,
  };
}

/**
 * Retrieves the user's vision text ("What do you want to become") from localStorage.
 */
export function getUserVisionStatement(): string {
  try {
    const stored =
      localStorage.getItem('ascend_becoming_goal') ||
      localStorage.getItem('ascend_user_vision') ||
      localStorage.getItem('ascend_vision_statement');
    if (stored && typeof stored === 'string') {
      return stored.trim();
    }
  } catch {}
  return '';
}
