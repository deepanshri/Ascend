import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Habit } from '../types';
import {
  hydrateHabitTimeOfDay,
  resolveHabitTimeOfDay,
  type TimeOfDay,
} from '../utils/timeOfDay';
import { getLocalDateString } from '../utils/dates';

/**
 * Foreground & Midnight Auto-Reset Listener:
 * - Tracks currentDateString in state, initialized with getLocalDateString().
 * - Uses @capacitor/app listener for appStateChange when app resumes from background.
 * - Checks every 60 seconds (or midnight roll-over) if the calendar day changed.
 * - Triggers refetchHabitsAndLogs() and updates currentDateString when day rolls over.
 */
export function useHabitAutoReset(
  refetchHabitsAndLogs?: () => void | Promise<void>
): {
  currentDateString: string;
  setCurrentDateString: React.Dispatch<React.SetStateAction<string>>;
} {
  const [currentDateString, setCurrentDateString] = useState<string>(() => getLocalDateString());
  const currentDateStringRef = useRef(currentDateString);
  currentDateStringRef.current = currentDateString;

  const refetchRef = useRef(refetchHabitsAndLogs);
  refetchRef.current = refetchHabitsAndLogs;

  const checkDateChange = useCallback(() => {
    const freshDate = getLocalDateString();
    if (freshDate !== currentDateStringRef.current) {
      currentDateStringRef.current = freshDate;
      setCurrentDateString(freshDate);
      void refetchRef.current?.();
    }
  }, []);

  useEffect(() => {
    let handleState: PluginListenerHandle | null = null;
    let handleResume: PluginListenerHandle | null = null;
    let cancelled = false;

    // Capacitor app foreground and resume listeners
    const subResume = CapApp.addListener('resume', checkDateChange);
    subResume
      .then((h) => {
        if (cancelled) {
          void h.remove();
        } else {
          handleResume = h;
        }
      })
      .catch(() => {});

    const subState = CapApp.addListener('appStateChange', (state) => {
      if (state.isActive) checkDateChange();
    });
    subState
      .then((h) => {
        if (cancelled) {
          void h.remove();
        } else {
          handleState = h;
        }
      })
      .catch(() => {});

    // Midnight rollover timer: checks every 60s
    const intervalId = window.setInterval(checkDateChange, 60_000);

    // Browser fallbacks
    const onResume = () => checkDateChange();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkDateChange();
    };

    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onVisibility);

    // Initial check on mount
    checkDateChange();

    return () => {
      cancelled = true;
      if (handleResume) void handleResume.remove();
      if (handleState) void handleState.remove();
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkDateChange]);

  return { currentDateString, setCurrentDateString };
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

/** Stamp the habit's bowl on a completion or momentum payload. */
export function withHabitTimeOfDay<T>(
  payload: T,
  habit: Pick<Habit, 'timeOfDay' | 'timestamp'>
): T & { timeOfDay: TimeOfDay } {
  return { ...payload, timeOfDay: resolveHabitTimeOfDay(habit) };
}
