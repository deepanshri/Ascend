/** Structured headline badges and natural, grammatical notification copy. */

import { Habit } from '../types';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';

/** Formats a habit or task title with a clean prefix badge. */
export function formatBadgeTitle(badge: string, rawTitle: string): string {
  const title = rawTitle.trim() || 'Daily Habit';
  return `${badge} ${title}`;
}

/** Standalone reminder prompt (10 min prior) */
export function reminderPriorCopy(taskTitle: string): { title: string; body: string } {
  const title = formatBadgeTitle('⏳', taskTitle);
  return {
    title,
    body: 'Scheduled reminder starting in 10 minutes.',
  };
}

/** Standalone reminder exact time */
export function reminderExactCopy(taskTitle: string): { title: string; body: string } {
  const title = formatBadgeTitle('📌', taskTitle);
  return {
    title,
    body: 'Scheduled time reached. Tap to mark complete.',
  };
}

/** Target time habit reminder */
export function habitTargetCopy(habit: Habit): { title: string; body: string } {
  const title = formatBadgeTitle('⏰', habit.name);
  const body = habit.purposeAnchor?.trim()
    ? `"${habit.purposeAnchor.trim()}" — Tap to complete.`
    : 'Target time reached. Tap to build your streak.';
  return { title, body };
}

/** Morning psychology notification */
export function morningMomentumCopy(featuredName: string): { title: string; body: string } {
  const title = formatBadgeTitle('🌅', `Morning Focus · ${featuredName.trim() || 'Today’s Habits'}`);
  return {
    title,
    body: 'Ready to build momentum? Tap to check in.',
  };
}

/** Afternoon psychology notification */
export function afternoonFocusCopy(
  featuredName: string,
  remaining: number
): { title: string; body: string } {
  if (remaining <= 0) {
    return {
      title: '⭐ Great Progress Today!',
      body: 'All scheduled habits checked off. Keep the momentum going.',
    };
  }
  const title = formatBadgeTitle('⚡', `Daily Focus · ${featuredName.trim() || 'Habit'}`);
  return {
    title,
    body: 'Keep your streak alive. Even a 2-minute fallback counts.',
  };
}

/** Night wrap-up notification */
export function nightWrapUpCopy(
  featuredName: string,
  remaining: number
): { title: string; body: string } {
  if (remaining <= 0) {
    return {
      title: '🏆 All Done for Today!',
      body: 'You locked in every habit. Rest well and celebrate your consistency.',
    };
  }
  const title = formatBadgeTitle('🌙', `Evening Wrap-up · ${featuredName.trim() || 'Habit'}`);
  return {
    title,
    body: 'Lock in your momentum vote before midnight.',
  };
}

/** Backward compatible helpers so any legacy references continue to function seamlessly */
export function reminderPromptCopy(habitName: string): string {
  return formatBadgeTitle('⏰', habitName);
}

export function completionConfirmCopy(habitName: string): string {
  return formatBadgeTitle('📌', habitName);
}

export function compactNotificationPair(habitName: string): { title: string; body: string } {
  const title = formatBadgeTitle('⚡', habitName);
  return { title, body: 'Tap to complete and lock in your momentum.' };
}

/** Swipe/toast alerts only fire on scheduled days — off-day toggles stay silent. */
export function shouldNotifyHabitSwipe(
  habit: Pick<Habit, 'scheduledDays'>,
  dayIndex: number,
  origin: Date = new Date()
): boolean {
  return isHabitScheduledOnDayIndex(habit, dayIndex, origin);
}
