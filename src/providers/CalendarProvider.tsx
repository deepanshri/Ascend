import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocalToday } from '../hooks/useLocalToday';
import { CENTERED_TODAY_INDEX, getWeekDates, localMidnightOf, parseIsoDateParts, startOfDay, toISODate } from '../utils/dates';

interface CalendarState {
  /** Today's device-local date (strict YYYY-MM-DD). */
  todayIso: string;
  /** Start of the day the 7-day strip is centred on (today, unless overridden for testing). */
  calendarOrigin: Date;
  /** The ISO date of `calendarOrigin`. */
  originIso: string;
  weekIsoDates: string[];
  todayDayIndex: number;
  selectedIso: string;
  currentDayIndex: number;
  isViewingToday: boolean;
}

interface CalendarActions {
  selectDate: (iso: string) => void;
}

const CalendarStateContext = createContext<CalendarState | null>(null);
const CalendarActionsContext = createContext<CalendarActions | null>(null);

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const todayIso = useLocalToday();
  /** Test hook (window.__setCalendarOrigin, used by scripts/verify_midnight_reset.mjs). */
  const [originOverride, setOriginOverride] = useState<Date | null>(null);
  const [selectedIso, setSelectedIso] = useState(todayIso);

  // A new day re-centres the strip on today and selects it.
  useEffect(() => {
    setOriginOverride(null);
    setSelectedIso(todayIso);
  }, [todayIso]);

  useEffect(() => {
    const w = window as unknown as { __setCalendarOrigin?: (target: Date | string) => void };
    w.__setCalendarOrigin = (target) => {
      if (typeof target === 'string') {
        const parts = parseIsoDateParts(target);
        setOriginOverride(startOfDay(parts ? new Date(parts.year, parts.month - 1, parts.day) : new Date(target)));
      } else {
        setOriginOverride(startOfDay(target));
      }
    };
    return () => {
      delete w.__setCalendarOrigin;
    };
  }, []);

  const calendarOrigin = useMemo(
    () => originOverride ?? localMidnightOf(todayIso) ?? startOfDay(new Date()),
    [originOverride, todayIso]
  );

  const state = useMemo<CalendarState>(() => {
    const weekIsoDates = getWeekDates(calendarOrigin).map((date) => toISODate(date));
    const index = weekIsoDates.indexOf(selectedIso);
    const currentDayIndex = index >= 0 ? index : CENTERED_TODAY_INDEX;
    return {
      todayIso,
      calendarOrigin,
      originIso: toISODate(calendarOrigin),
      weekIsoDates,
      todayDayIndex: CENTERED_TODAY_INDEX,
      selectedIso,
      currentDayIndex,
      isViewingToday: selectedIso === weekIsoDates[CENTERED_TODAY_INDEX],
    };
  }, [todayIso, calendarOrigin, selectedIso]);

  const selectDate = useCallback((iso: string) => setSelectedIso(iso), []);
  const actions = useMemo<CalendarActions>(() => ({ selectDate }), [selectDate]);

  return (
    <CalendarActionsContext.Provider value={actions}>
      <CalendarStateContext.Provider value={state}>{children}</CalendarStateContext.Provider>
    </CalendarActionsContext.Provider>
  );
}

export function useCalendar(): CalendarState {
  const value = useContext(CalendarStateContext);
  if (!value) throw new Error('useCalendar must be used inside CalendarProvider');
  return value;
}

export function useCalendarActions(): CalendarActions {
  const value = useContext(CalendarActionsContext);
  if (!value) throw new Error('useCalendarActions must be used inside CalendarProvider');
  return value;
}
