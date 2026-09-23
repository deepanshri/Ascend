/** Structured headline copy and natural, action-oriented notification phrasing. */

import { Habit } from '../types';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';

/** Formats a habit or task title with a clean bullet or action prefix. */
export function formatActionTitle(prefix: string, rawTitle: string): string {
  const title = rawTitle.trim() || 'Daily Habit';
  return `${prefix} • ${title}`;
}

/** Standalone reminder prompt (10 min prior) */
export function reminderPriorCopy(taskTitle: string): { title: string; body: string } {
  const title = formatActionTitle('Upcoming in 10m', taskTitle);
  return {
    title,
    body: 'Scheduled reminder starting in 10 minutes.',
  };
}

/** Standalone reminder exact time */
export function reminderExactCopy(taskTitle: string): { title: string; body: string } {
  const title = `Scheduled Execution: ${taskTitle.trim() || 'Reminder'}`;
  return {
    title,
    body: 'Target time reached. Time to execute.',
  };
}

/**
 * Target time habit reminder with natural, action-oriented copy.
 * Directly replaces awkward template strings with clean phrasing:
 * Title: "Target Time Reached"
 * Body: "${habit.title} — time to execute."
 * Works seamlessly with any habit title structure (e.g. "Wake at 5", "Soak something", "Atomic habits").
 */
export function habitTargetCopy(
  habit: Pick<Habit, 'name'> & Partial<Pick<Habit, 'purposeAnchor'>> & { title?: string }
): { title: string; body: string } {
  const habitTitle = (habit.title || habit.name || 'Daily Habit').trim();
  return {
    title: 'Target Time Reached',
    body: `${habitTitle} — time to execute.`,
  };
}

/** Clean direct phrasing helper for custom habit targets */
export function formatHabitTargetCopy(
  habitName: string,
  _purposeAnchor?: string
): { title: string; body: string } {
  const habitTitle = habitName.trim() || 'Daily Habit';
  return {
    title: 'Target Time Reached',
    body: `${habitTitle} — time to execute.`,
  };
}

/** Alternative headline format with bullet divider: Target Time Reached • Wake at 5 */
export function formatActionHeadline(habitTitle: string): { title: string; body: string } {
  const title = habitTitle.trim() || 'Daily Habit';
  return {
    title: `Target Time Reached • ${title}`,
    body: `${title} — time to execute.`,
  };
}

/** Morning psychology notification */
export function morningMomentumCopy(featuredName: string): { title: string; body: string } {
  const name = featuredName.trim() || 'Today’s Habits';
  return {
    title: `Morning Momentum • ${name}`,
    body: 'Ready to build momentum? Time to check in.',
  };
}

/** Afternoon psychology notification */
export function afternoonFocusCopy(
  featuredName: string,
  remaining: number
): { title: string; body: string } {
  if (remaining <= 0) {
    return {
      title: 'Great Progress Today!',
      body: 'All scheduled habits checked off. Keep your momentum alive!',
    };
  }
  const name = featuredName.trim() || 'Habit';
  return {
    title: `Daily Focus • ${name}`,
    body: 'Scheduled execution reminder. Keep your streak alive!',
  };
}

/** Night wrap-up notification */
export function nightWrapUpCopy(
  featuredName: string,
  remaining: number
): { title: string; body: string } {
  if (remaining <= 0) {
    return {
      title: 'All Done for Today!',
      body: 'You locked in every habit. Rest well and celebrate your consistency.',
    };
  }
  const name = featuredName.trim() || 'Habit';
  return {
    title: `Evening Wrap-up • ${name}`,
    body: 'Lock in your daily momentum vote before midnight.',
  };
}

/** Backward compatible helpers so any legacy references continue to function seamlessly */
export function reminderPromptCopy(habitName: string): string {
  return formatActionTitle('Target Time Reached', habitName);
}

export function completionConfirmCopy(habitName: string): string {
  return `Scheduled Execution: ${habitName.trim() || 'Habit'}`;
}

export function compactNotificationPair(habitName: string): { title: string; body: string } {
  const name = habitName.trim() || 'Daily Habit';
  return {
    title: `Daily Focus • ${name}`,
    body: `${name} — time to execute and lock in your momentum.`,
  };
}

/** Swipe/toast alerts only fire on scheduled days — off-day toggles stay silent. */
export function shouldNotifyHabitSwipe(
  habit: Pick<Habit, 'scheduledDays'>,
  dayIndex: number,
  origin: Date = new Date()
): boolean {
  return isHabitScheduledOnDayIndex(habit, dayIndex, origin);
}
