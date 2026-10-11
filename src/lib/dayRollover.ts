/**
 * Pure day-rollover decision: given the last day the app was active and
 * today's date, work out which scheduled habits were missed and what the
 * ledger must change. No clock, storage, network or id generation here;
 * every input is passed in and every effect is returned for the caller.
 *
 * Dates are strict device-local `YYYY-MM-DD` strings throughout, so DST shifts
 * and timezone changes only ever move "today" to another valid calendar day.
 */
import type { Habit, MomentumEvent } from '../types';
import { addDaysIso, dayIndexForIso, diffDaysIso, isIsoDate, parseIsoDateParts } from '../utils/dates';
import { resolveMomentumEventDate } from '../utils/momentumDates';
import { isHabitScheduledOnDayIndex, isHabitScheduledOnIso } from '../utils/schedule';

export interface DayRolloverInput {
  /** Today's device-local date. */
  todayIso: string;
  /** Furthest day already processed (stored); null on first run. */
  lastActiveIso: string | null;
  habits: Habit[];
  momentumEvents: MomentumEvent[];
  /** Exam Shield or Vacation is active: missed days are not counted. */
  protectionPaused: boolean;
  /** Whether missed-day processing runs at all (onboarding gate). */
  processMissedDays: boolean;
}

export interface MissedHabitDay {
  habitId: string;
  habitName: string;
  isoDate: string;
}

export interface DayRolloverResult {
  /** Today is a later calendar day than the last processed one. */
  dayChanged: boolean;
  /** Value to store as the last active day. Never moves backwards. */
  lastActiveIso: string;
  /** Today's fallback-mode selections no longer apply. */
  clearActiveFallbacks: boolean;
  /** Missed days to record as hard 'missed' momentum events (gaps of more than one day). */
  missed: MissedHabitDay[];
  /**
   * Habits missed yesterday, offered a 24-hour grace rollover instead of a hard
   * miss. null: leave the current grace list unchanged.
   */
  graceHabitIds: string[] | null;
  /** Friction prompts to queue: one per missed habit-day. */
  frictionPrompts: Array<{ habitId: string; habitName: string; loggedDate: string }>;
}

/** Scheduled, active habits with no momentum event on `isoDate`. */
export function missedHabitsOn(habits: Habit[], events: MomentumEvent[], isoDate: string): Habit[] {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return [];
  // Noon keeps the reference inside the day across DST transitions.
  const origin = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const dayIndex = dayIndexForIso(isoDate, origin);
  const logged = new Set(
    events.filter((event) => resolveMomentumEventDate(event) === isoDate).map((event) => event.habitId)
  );
  return habits.filter((habit) => {
    if (habit.archived) return false;
    if (dayIndex >= 0 && !isHabitScheduledOnDayIndex(habit, dayIndex, origin)) return false;
    if (!isHabitScheduledOnIso(habit, isoDate)) return false;
    return !logged.has(habit.id);
  });
}

export function computeDayRollover(input: DayRolloverInput): DayRolloverResult {
  const { todayIso } = input;
  const lastActiveIso = input.lastActiveIso && isIsoDate(input.lastActiveIso) ? input.lastActiveIso : null;
  const unchanged: DayRolloverResult = {
    dayChanged: false,
    // First run (or unreadable stored value) starts from today; a later stored day
    // (clock or timezone moved backwards) is kept so no day is processed twice.
    lastActiveIso: lastActiveIso && lastActiveIso > todayIso ? lastActiveIso : todayIso,
    clearActiveFallbacks: false,
    missed: [],
    graceHabitIds: null,
    frictionPrompts: [],
  };
  if (!lastActiveIso) return unchanged;

  const dayDiff = diffDaysIso(lastActiveIso, todayIso);
  if (dayDiff <= 0) return unchanged;

  const result: DayRolloverResult = { ...unchanged, dayChanged: true, lastActiveIso: todayIso, clearActiveFallbacks: true };
  if (!input.processMissedDays) return result;

  const graceHabitIds: string[] = [];
  for (let step = 0; step < dayDiff; step += 1) {
    if (input.protectionPaused) continue;
    const isoDate = addDaysIso(lastActiveIso, step);
    for (const habit of missedHabitsOn(input.habits, input.momentumEvents, isoDate)) {
      const habitName = habit.name || 'Habit';
      result.frictionPrompts.push({ habitId: habit.id, habitName, loggedDate: isoDate });
      // Only yesterday gets the grace window; anything older is a hard miss.
      if (dayDiff === 1) graceHabitIds.push(habit.id);
      else result.missed.push({ habitId: habit.id, habitName, isoDate });
    }
  }
  result.graceHabitIds = dayDiff === 1 ? graceHabitIds : [];
  return result;
}
