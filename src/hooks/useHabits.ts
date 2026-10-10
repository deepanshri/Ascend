import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
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

/**
 * Merge authoritative cycle pieces with optimistic drops so marbles appear at t=0
 * before (or without waiting on) remote hydration. Optimistic rows lose once the
 * real completionEvents catch up with the same habitId::isoDate key.
 */
export function mergeOptimisticBowlPieces(
  authoritative: AccumulationPiece[],
  optimistic: AccumulationPiece[]
): AccumulationPiece[] {
  const byId = new Map<string, AccumulationPiece>();
  for (const piece of authoritative) byId.set(piece.id, piece);
  for (const piece of optimistic) {
    if (!byId.has(piece.id)) byId.set(piece.id, piece);
  }
  return Array.from(byId.values()).sort(
    (a, b) => a.isoDate.localeCompare(b.isoDate) || a.id.localeCompare(b.id)
  );
}

/** Build a single optimistic marble for an immediate habit check. */
export function makeOptimisticBowlPiece(input: {
  habitId: string;
  isoDate: string;
  kind?: AccumulationPiece['kind'];
}): AccumulationPiece {
  const kind = input.kind ?? 'full';
  return {
    id: `${input.habitId}::${input.isoDate}`,
    habitId: input.habitId,
    isoDate: input.isoDate,
    kind,
  };
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
