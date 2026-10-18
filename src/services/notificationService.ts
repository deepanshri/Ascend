/** Structured headline copy and natural, action-oriented notification phrasing. */

import { Habit } from '../types';
import { isDefaultPurposeAnchor } from '../lib/createHabitValidation';

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

export const HABIT_TARGET_COPY_TEMPLATES = [
  'Imperfect consistency compounds: {habit_name} in 15 mins.',
  'No need for perfection, just presence: {habit_name} coming up.',
  'Showing up counts—no matter how small: {habit_name} starts soon.',
  "Cast today's vote: {habit_name} in 15 minutes.",
  '15-minute heads-up: Time to show up for {habit_name}.',
  "Remember what you're building towards: ready for {habit_name}?",
] as const;

/**
 * Body for the 15-minute habit heads-up. Leads with the habit's own Purpose Anchor
 * when the user wrote one; otherwise a rotating generic line.
 */
export function habitTargetBody(
  habit: Pick<Habit, 'name'> & Partial<Pick<Habit, 'purposeAnchor'>>,
  random: () => number = Math.random
): string {
  const habitName = habit.name?.trim() || 'your habit';
  const purpose = habit.purposeAnchor?.trim() ?? '';
  if (purpose && !isDefaultPurposeAnchor(purpose)) {
    return `${habitName} in 15 min — ${purpose}`;
  }
  const template =
    HABIT_TARGET_COPY_TEMPLATES[Math.floor(random() * HABIT_TARGET_COPY_TEMPLATES.length)];
  return template.replace('{habit_name}', habitName);
}

/** Morning psychology notification */
export function morningMomentumCopy(_featuredName?: string): { title: string; body: string } {
  return {
    title: 'Morning Focus',
    body: "Let's execute today's plan.",
  };
}

/** Evening Chronicle reminder, fired at the user's configured Chronicle time. */
export function chronicleReminderCopy(): { title: string; body: string } {
  return {
    title: 'Evening Chronicle',
    body: 'Two minutes to reflect on today and set up tomorrow.',
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
    title: `Still Open Today • ${name}`,
    body: 'Lock in your daily momentum vote before midnight.',
  };
}
