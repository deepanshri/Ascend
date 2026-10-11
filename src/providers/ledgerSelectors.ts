/**
 * Pure views derived from the ledger. HabitLedgerProvider memoises each one;
 * code that must read the very latest ledger (such as a widget refresh that
 * runs before React has rendered) calls them directly on getSnapshot().
 */
import type { Habit, MomentumEvent, ProtectionWindow } from '../types';
import {
  calculateMomentumScore,
  deriveHabitsFromEventLog,
  mergeMomentumEvents,
  momentumEventsFromCompletionLog,
} from '../utils/momentumCore';
import type { LedgerState } from './ledgerReducer';

/** Habits with this week's days / microDays replayed from the completion log. */
export function selectDerivedHabits(state: Pick<LedgerState, 'habits' | 'completionEvents'>, origin: Date): Habit[] {
  return deriveHabitsFromEventLog(state.habits, state.completionEvents, origin);
}

export function selectActiveHabits(derivedHabits: Habit[]): Habit[] {
  return derivedHabits.filter((habit) => !habit.archived);
}

/** The momentum log merged with the votes the completion log implies. */
export function selectTodayMomentumEvents(
  state: Pick<LedgerState, 'habits' | 'completionEvents' | 'momentumEvents'>,
  origin: Date
): MomentumEvent[] {
  return mergeMomentumEvents(state.momentumEvents, momentumEventsFromCompletionLog(state.completionEvents, state.habits, origin));
}

export function selectTodayMomentumScore(
  todayMomentumEvents: MomentumEvent[],
  habits: Habit[],
  protectionWindows: ProtectionWindow[]
): number {
  return calculateMomentumScore(todayMomentumEvents, { habits, protectionWindows });
}

/** Everything the home-screen widget shows, from one ledger snapshot. */
export function selectWidgetLedgerView(state: LedgerState, origin: Date, protectionWindows: ProtectionWindow[]) {
  const todayMomentumEvents = selectTodayMomentumEvents(state, origin);
  return {
    activeHabits: selectActiveHabits(selectDerivedHabits(state, origin)),
    todayMomentumScore: selectTodayMomentumScore(todayMomentumEvents, state.habits, protectionWindows),
    momentumEvents: state.momentumEvents,
    completionEvents: state.completionEvents,
    graceHabitIds: state.rolledOverHabits,
  };
}
