import { useMemo } from 'react';
import { Habit } from '../types';
import {
  hydrateHabitTimeOfDay,
  resolveHabitTimeOfDay,
  type TimeOfDay,
} from '../utils/timeOfDay';

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

/** Stamp the habit's bowl on a completion or momentum payload. */
export function withHabitTimeOfDay<T>(
  payload: T,
  habit: Pick<Habit, 'timeOfDay' | 'timestamp'>
): T & { timeOfDay: TimeOfDay } {
  return { ...payload, timeOfDay: resolveHabitTimeOfDay(habit) };
}
