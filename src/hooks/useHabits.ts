import { useCallback, useMemo, useState } from 'react';
import { Habit, HabitCompletionEvent } from '../types';
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

/** Ensure fetched/local habits always carry a resolved `timeOfDay`. */
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
export function withHabitTimeOfDay<T extends { timeOfDay?: TimeOfDay }>(
  payload: T,
  habit: Pick<Habit, 'timeOfDay' | 'timestamp'>
): T {
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
