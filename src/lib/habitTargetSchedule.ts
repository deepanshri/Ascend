import type { Habit } from '../types';
import { isHabitScheduledOnWeekday, weekdayMon0FromDate } from '../utils/schedule';
import { parseTargetTimeHHmm } from '../utils/timeFormat';
import { DAYS_QUEUED } from './dailyTimes';

/** The heads-up fires this long before the habit's target time. */
export const HABIT_TARGET_LEAD_MS = 15 * 60 * 1000;
/** Today's heads-up when its slot has passed but the target hasn't: fire almost at once. */
const LATE_FIRE_DELAY_MS = 5000;

// Habit target ids live in 100000–199999 (clear of psychology 20300–20306 / 81000–81006 /
// 81300–81306, chronicle 82000–82006 and reminders 210000–909999). Each habit gets
// DAYS_QUEUED consecutive ids, one per queued day.
const HABIT_TARGET_ID_BASE = 100000;
const HABIT_TARGET_SLOTS = Math.floor(100000 / DAYS_QUEUED);

function habitIdHash(habitId: string): number {
  let hash = 0x45d9f3b >>> 0;
  const key = `habit-target-${habitId}`;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  return hash;
}

/** The id each queued day of this habit's heads-up uses: index = days from today. */
export function habitTargetNotificationIds(habitId: string): number[] {
  const base = HABIT_TARGET_ID_BASE + (habitIdHash(habitId) % HABIT_TARGET_SLOTS) * DAYS_QUEUED;
  return Array.from({ length: DAYS_QUEUED }, (_, i) => base + i);
}

/** The single id builds before multi-day queueing used: cancelled so an old alarm can't linger. */
export function legacyHabitTargetNotificationId(habitId: string): number {
  return (HABIT_TARGET_ID_BASE + (habitIdHash(habitId) % 100000)) | 0;
}

export interface PlannedHabitTarget {
  id: number;
  /** Days from today: 0 = today. */
  offset: number;
  at: Date;
}

/**
 * Heads-ups for the next DAYS_QUEUED days: one per day the habit is scheduled,
 * HABIT_TARGET_LEAD_MS before its target time. Today's is skipped once the habit
 * is completed or the target has passed; if only the heads-up slot has passed,
 * it fires in a few seconds. Empty for an archived habit or one without a valid
 * target time.
 */
export function planHabitTargetNotifications(
  habit: Pick<Habit, 'id' | 'targetTime' | 'archived' | 'scheduledDays'>,
  completedToday: boolean,
  now: Date = new Date()
): PlannedHabitTarget[] {
  if (habit.archived || !habit.targetTime) return [];
  const parsed = parseTargetTimeHHmm(habit.targetTime);
  if (!parsed) return [];

  const ids = habitTargetNotificationIds(habit.id);
  const nowMs = now.getTime();
  const planned: PlannedHabitTarget[] = [];
  for (let offset = 0; offset < DAYS_QUEUED; offset++) {
    if (offset === 0 && completedToday) continue;
    // Built from calendar fields, so a DST change keeps the wall-clock time.
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, parsed.hour, parsed.minute, 0, 0);
    if (!isHabitScheduledOnWeekday(habit, weekdayMon0FromDate(target))) continue;
    if (target.getTime() <= nowMs) continue;
    let at = new Date(target.getTime() - HABIT_TARGET_LEAD_MS);
    if (at.getTime() <= nowMs) at = new Date(nowMs + LATE_FIRE_DELAY_MS);
    planned.push({ id: ids[offset], offset, at });
  }
  return planned;
}
