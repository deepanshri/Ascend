/**
 * Pure planners for ledger gestures. Each reads the current ledger state plus
 * an injected clock (time, random nonce, calendar origin) and returns exactly
 * what should change, or null when the gesture does nothing. The provider
 * dispatches the plan to ledgerReducer and runs the side effects it implies
 * (remote writes, notifications) — nothing here touches storage, network,
 * timers or native APIs.
 */
import type {
  FrictionAudit,
  Habit,
  HabitCategory,
  HabitCompletionEvent,
  IdentityEvidence,
  MomentumEvent,
} from '../types';
import { createMomentumEvent, habitWeight, nextMomentumEventId } from '../utils/momentumCore';
import {
  dayIndexForIso,
  endOfIsoDate,
  formatEvidenceDate,
  formatIsoShort,
  getLocalDateString,
  resolveEventIsoDate,
  toISODate,
} from '../utils/dates';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';
import { resolveHabitTimeOfDay, withHabitTimeOfDay } from '../utils/timeOfDay';
import { stableHabitLogId } from '../utils/stableId';
import { hasMomentumVoteOnIso, hasTodayLedgerEntry } from '../services/ledgerService';
import { isAtActiveHabitCap } from '../lib/protection';
import type { LedgerState } from './ledgerReducer';

export interface LedgerClock {
  /** Epoch ms for timestamps. */
  now: number;
  /** Random suffix for display-only ids (evidence rows). */
  nonce: string;
  /** Start of the day the calendar is centred on (today). */
  origin: Date;
  /** Index of today in the 7-day strip. */
  todayDayIndex: number;
}

const WEEK_OFF = [false, false, false, false, false, false, false];

function shortDate(now: number): string {
  return new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sameHabitDay(event: HabitCompletionEvent, habitId: string, isoDate: string, origin: Date): boolean {
  return event.habitId === habitId && resolveEventIsoDate(event, origin) === isoDate;
}

// ---------------------------------------------------------------------------
// Complete today

export interface CompletionPlan {
  habitId: string;
  loggedDate: string;
  isMicro: boolean;
  /** False when the habit was already logged today (re-swipe replaces the row). */
  newlyCompleted: boolean;
  completionEvent: HabitCompletionEvent;
  evidence: IdentityEvidence;
  /** Null when today already holds a momentum vote for this habit. */
  momentumEvent: MomentumEvent | null;
  /** A "fallback used" audit for a first micro completion. */
  audit: FrictionAudit | null;
}

export function planCompletion(
  state: LedgerState,
  habitId: string,
  isFallback: boolean,
  clock: LedgerClock
): CompletionPlan | null {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return null;
  // Off day: the schedule blocks completion.
  if (!isHabitScheduledOnDayIndex(habit, clock.todayDayIndex, clock.origin)) return null;

  const { now, origin, todayDayIndex } = clock;
  // The explicit flag wins; activeFallbackIds covers the mode-then-complete flow.
  const isMicro = isFallback || state.activeFallbackIds.includes(habitId);
  const loggedDate = toISODate(origin);
  const alreadyCompleted = hasTodayLedgerEntry(state.completionEvents, habitId, loggedDate, origin);
  const alreadyVoted = hasMomentumVoteOnIso(state.momentumEvents, habitId, loggedDate);

  const completionEvent: HabitCompletionEvent = withHabitTimeOfDay(
    {
      id: stableHabitLogId(habitId, loggedDate),
      habitId,
      dayIndex: todayDayIndex,
      date: loggedDate,
      type: isMicro ? 'fallback_micro' : 'full',
      note: isMicro ? habit.fallbackMicroHabit || 'Fallback micro-habit completed' : undefined,
      timestamp: now,
    },
    habit
  );

  const evidence: IdentityEvidence = {
    id: alreadyCompleted ? `ev-${habitId}-${loggedDate}` : `ev-${isMicro ? 'micro-' : ''}${now}-${clock.nonce}`,
    habitId,
    habitName: isMicro ? `${habit.name} (Micro-Habit)` : habit.name,
    identityStatement: isMicro
      ? `Micro-Habit vote: ${habit.name || 'Non-zero progress'}`
      : habit.name || 'Consistent and disciplined',
    category: habit.category || 'work',
    date: `${formatEvidenceDate(new Date(now))} • ${isMicro ? 'Fallback micro (50%)' : 'Completed (100%)'}`,
    dayNumber: todayDayIndex + 1,
    loggedDate,
  };

  const baseWeight = habitWeight(habit);
  const eventType = isMicro ? 'fallback' : 'full';
  // Re-completing after an undo needs a fresh id, or the server skips it as a duplicate.
  const momentumEvent = alreadyVoted
    ? null
    : {
        ...createMomentumEvent(habit, eventType, loggedDate, now, isMicro ? baseWeight * 0.5 : baseWeight),
        id: nextMomentumEventId(state.momentumEvents, habitId, loggedDate, eventType),
      };

  const audit: FrictionAudit | null =
    isMicro && !alreadyCompleted
      ? {
          id: `fa-${now}`,
          date: shortDate(now),
          dayNumber: todayDayIndex + 1,
          habitName: habit.name,
          type: 'fallback_used',
          note: `Protected momentum with fallback: "${habit.fallbackMicroHabit || '2-min minimum'}"`,
          timestamp: now,
        }
      : null;

  return {
    habitId,
    loggedDate,
    isMicro,
    newlyCompleted: !alreadyCompleted,
    completionEvent,
    evidence,
    momentumEvent,
    audit,
  };
}

// ---------------------------------------------------------------------------
// Grace rollover (log missed habits as 50% micro-habits on a past day)

export interface GraceRolloverItem {
  completionEvent: HabitCompletionEvent;
  momentumEvent: MomentumEvent;
  evidence: IdentityEvidence;
}

export interface GraceRolloverPlan {
  dateIso: string;
  items: GraceRolloverItem[];
}

export function planGraceRollover(
  targets: Habit[],
  dateIso: string,
  clock: Pick<LedgerClock, 'now' | 'nonce' | 'origin'>
): GraceRolloverPlan {
  const dayIndex = dayIndexForIso(dateIso, clock.origin);
  const safeDayIndex = dayIndex >= 0 ? dayIndex : 2;
  const timestamp = endOfIsoDate(dateIso) - 60_000;
  const items = targets.map((habit, index) => {
    const completionEvent: HabitCompletionEvent = withHabitTimeOfDay(
      {
        id: stableHabitLogId(habit.id, dateIso),
        habitId: habit.id,
        dayIndex: safeDayIndex,
        date: dateIso,
        type: 'fallback_micro',
        note: habit.fallbackMicroHabit || 'Grace rollover (50% micro-habit)',
        timestamp,
      },
      habit
    );
    return {
      completionEvent,
      momentumEvent: createMomentumEvent(habit, 'fallback', dateIso, timestamp, habitWeight(habit) * 0.5),
      evidence: {
        id: `ev-micro-${clock.now}-${clock.nonce}${index}`,
        habitId: habit.id,
        habitName: habit.name,
        identityStatement: `Micro-Habit rollover: ${habit.name || 'Consistency preserved'}`,
        category: habit.category || 'work',
        date: `${formatIsoShort(dateIso)} • Grace rollover (50%)`,
        dayNumber: safeDayIndex + 1,
        loggedDate: dateIso,
      },
    };
  });
  return { dateIso, items };
}

// ---------------------------------------------------------------------------
// Fallback mode toggle (does not complete; removes today's log when entering)

export type FallbackTogglePlan =
  | { habitId: string; activate: false }
  | { habitId: string; activate: true; loggedDate: string; removesLog: boolean };

export function planToggleFallback(
  state: LedgerState,
  habitId: string,
  clock: Pick<LedgerClock, 'origin' | 'todayDayIndex'>
): FallbackTogglePlan | null {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return null;
  const isActive = state.activeFallbackIds.includes(habitId);
  if (isActive) return { habitId, activate: false };
  if (!isHabitScheduledOnDayIndex(habit, clock.todayDayIndex, clock.origin)) return null;
  const loggedDate = toISODate(clock.origin);
  const removesLog = state.completionEvents.some((event) => sameHabitDay(event, habitId, loggedDate, clock.origin));
  return { habitId, activate: true, loggedDate, removesLog };
}

// ---------------------------------------------------------------------------
// Uncheck today

export interface ResetTodayPlan {
  habitId: string;
  loggedDate: string;
  /** Today's momentum event still waiting for its delayed upload: dropped instead of reversed. */
  cancelledMomentumId: string | null;
  /** Append-only reversal for a vote that already reached the log. */
  reversal: MomentumEvent | null;
}

export function planResetToday(
  state: LedgerState,
  habitId: string,
  pendingMomentumId: string | null,
  clock: Pick<LedgerClock, 'now' | 'origin'>
): ResetTodayPlan {
  const loggedDate = toISODate(clock.origin);
  const existing = state.completionEvents.find((event) => sameHabitDay(event, habitId, loggedDate, clock.origin));
  const habit = state.habits.find((h) => h.id === habitId);
  let reversal: MomentumEvent | null = null;
  if (!pendingMomentumId && habit) {
    const baseWeight = habitWeight(habit);
    const weight = existing?.type === 'fallback_micro' ? baseWeight * 0.5 : baseWeight;
    reversal = {
      ...createMomentumEvent(habit, 'reversal', loggedDate, clock.now, weight),
      id: nextMomentumEventId(state.momentumEvents, habitId, loggedDate, 'reversal'),
    };
  }
  return { habitId, loggedDate, cancelledMomentumId: pendingMomentumId, reversal };
}

// ---------------------------------------------------------------------------
// Manual identity vote

export function planManualVote(
  habitName: string,
  identityStatement: string,
  category: HabitCategory,
  input: { now: number; dayNumber: number; momentumEventId: string }
): { evidence: IdentityEvidence; momentumEvent: MomentumEvent } {
  const today = getLocalDateString(new Date(input.now));
  return {
    evidence: {
      id: `ev-manual-${input.now}`,
      habitId: 'manual',
      habitName,
      identityStatement,
      category,
      date: new Date(input.now).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      dayNumber: input.dayNumber,
      loggedDate: today,
    },
    // Each manual vote gets its own random habit key, so votes never collapse into one row.
    momentumEvent: createMomentumEvent({ id: input.momentumEventId, category }, 'full', today, input.now),
  };
}

// ---------------------------------------------------------------------------
// New habit

export function planNewHabit(
  habits: Habit[],
  data: Omit<Habit, 'id' | 'days' | 'microDays'>,
  input: { now: number; id: string }
): Habit | null {
  if (isAtActiveHabitCap(habits)) return null;
  return {
    ...data,
    id: input.id,
    days: [...WEEK_OFF],
    microDays: [...WEEK_OFF],
    scheduledDays: data.scheduledDays && data.scheduledDays.length > 0 ? data.scheduledDays : [0, 1, 2, 3, 4, 5, 6],
    scheduleType: data.scheduleType || 'daily',
    timeOfDay: resolveHabitTimeOfDay(data),
    updatedAt: input.now,
  };
}
