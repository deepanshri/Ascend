import { useCallback, useMemo, useState } from 'react';
import { Habit, HabitCompletionEvent } from '../types';
import {
  accumulationPiecesFromLogs,
  type AccumulationPiece,
} from '../services/reportService';
import {
  hydrateHabitTimeOfDay,
  persistBowlMode,
  readStoredBowlMode,
  resolveHabitTimeOfDay,
  type TimeOfDay,
} from '../utils/timeOfDay';

/** Last selected bowl mode, falling back to AM/PM from the system clock. */
export function useBowlMode(): {
  mode: TimeOfDay;
  setMode: (mode: TimeOfDay) => void;
} {
  const [mode, setModeState] = useState<TimeOfDay>(() => readStoredBowlMode());
  const setMode = useCallback((next: TimeOfDay) => {
    setModeState(next);
    persistBowlMode(next);
  }, []);
  return { mode, setMode };
}

/** Ensure fetched/local habits always carry a resolved `timeOfDay` for bowl routing. */
/**
 * Habits split by morning/night for dual-bowl capacity analytics.
 * Home Accumulation Bowl still merges both across the active multi-day cycle window.
 */
export function useHabits(habits: Habit[]): {
  habits: Habit[];
  morningHabits: Habit[];
  nightHabits: Habit[];
} {
  const resolved = useMemo(() => habits.map(hydrateHabitTimeOfDay), [habits]);
  const morningHabits = useMemo(
    () => resolved.filter((habit) => resolveHabitTimeOfDay(habit) === 'morning'),
    [resolved]
  );
  const nightHabits = useMemo(
    () => resolved.filter((habit) => resolveHabitTimeOfDay(habit) === 'night'),
    [resolved]
  );
  return { habits: resolved, morningHabits, nightHabits };
}

/** Net daily completion count for a habit set (one vote per habit per ISO day). */
export function netDailyCompletionCount(
  events: HabitCompletionEvent[],
  habitIds: Iterable<string>
): number {
  const allow = new Set(habitIds);
  const keys = new Set<string>();
  for (const event of events) {
    if (!allow.has(event.habitId)) continue;
    const iso = event.date || '';
    if (!iso) continue;
    keys.add(`${event.habitId}::${iso}`);
  }
  return keys.size;
}

/**
 * Bowl pieces for the active cycle — derived ONLY from habit_logs / completionEvents.
 * Does not read or mutate momentum_events (append-only Identity Ledger).
 */
export function buildCycleAccumulationPieces(input: {
  completionEvents: HabitCompletionEvent[];
  activeHabitIds: Iterable<string>;
  startIso: string;
  endIso: string;
  origin?: Date;
  minTimestamp?: number;
}): AccumulationPiece[] {
  return accumulationPiecesFromLogs(
    input.completionEvents,
    input.activeHabitIds,
    input.startIso,
    input.endIso,
    input.origin ?? new Date(),
    input.minTimestamp ?? 0
  );
}

/** Stamp the habit's bowl on a completion or momentum payload. */
export function withHabitTimeOfDay<T>(
  payload: T,
  habit: Pick<Habit, 'timeOfDay' | 'timestamp'>
): T & { timeOfDay: TimeOfDay } {
  return { ...payload, timeOfDay: resolveHabitTimeOfDay(habit) };
}

export function completionEventTimeOfDay(
  event: Pick<HabitCompletionEvent, 'habitId' | 'timeOfDay'>,
  habitsById: Map<string, Pick<Habit, 'timeOfDay' | 'timestamp'>>
): TimeOfDay {
  if (event.timeOfDay === 'morning' || event.timeOfDay === 'night') return event.timeOfDay;
  const habit = habitsById.get(event.habitId);
  return habit ? resolveHabitTimeOfDay(habit) : 'morning';
}
