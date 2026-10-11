/** Structured headline copy and natural, action-oriented notification phrasing. */

import { Habit } from '../types';

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

/** Morning psychology notification */
export function morningMomentumCopy(_featuredName?: string): { title: string; body: string } {
  return {
    title: 'Morning Focus',
    body: "Let's execute today's plan : Open chronicle",
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
    body: 'Scheduled execution reminder. Imperfect consistency compounds over time.',
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
