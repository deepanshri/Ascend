import React, { useCallback, useEffect, useRef } from 'react';
import { flushWrite, scheduleWrite } from '../lib/pendingWrites';
import { hideNativeSplash } from '../lib/nativeChrome';
import { schedulePsychologyNotifications, syncAllHabitTargetNotifications } from '../lib/notifications';
import { publishWidgetSnapshot } from '../lib/widgetSync';
import { useCalendar } from './CalendarProvider';
import { useLedger, useLedgerActions } from './HabitLedgerProvider';
import { selectWidgetLedgerView } from './ledgerSelectors';
import { useProtection } from './ProtectionProvider';
import { useOnboarding } from './OnboardingProvider';
import { usePreferences } from './PreferencesProvider';
import { useReminders } from './RemindersProvider';
import { useSession } from './SessionProvider';
import { useTheme } from './ThemeProvider';

/** Coalesces bursts of ledger changes (a swipe touches several slices) into one widget refresh. */
const WIDGET_REFRESH_DEBOUNCE_MS = 400;
/** Key in the pending-writes registry: the background flush publishes a waiting refresh at once. */
const WIDGET_REFRESH_KEY = 'native:widget-snapshot';
const NOTIFICATION_DEBOUNCE_MS = 500;
const SPLASH_HIDE_MS = 1500;
const NO_NOTIFICATION_WINDOWS = { morning: false, afternoon: false, night: false };

/**
 * Mirrors app state into the OS: the home-screen widget snapshot, scheduled
 * notifications and the native splash screen. Renders no UI.
 */
export function NativeSyncController({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { isOnboarded, onboardingStep } = useOnboarding();
  const { notificationWindows } = usePreferences();
  const { isDark } = useTheme();
  const { todayDayIndex, calendarOrigin } = useCalendar();
  const { reminders } = useReminders();
  const { habits, activeHabits, completionEvents, todayMomentumScore } = useLedger();

  useEffect(() => {
    const timer = window.setTimeout(() => void hideNativeSplash().catch(() => {}), SPLASH_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Widget snapshot. Scheduled through the pending-writes registry rather than
  // a bare timer: when the OS backgrounds the app inside the debounce window,
  // installBackgroundFlush publishes it immediately. The snapshot is built when
  // it is published, from the ledger's latest state (getSnapshot), and every
  // ledger change schedules it synchronously, before React renders, so even a
  // tap followed at once by the home button reaches the widget. A sign-out purge
  // discards it with every other pending write.
  const { protectionWindows } = useProtection();
  const { getSnapshot, subscribe } = useLedgerActions();
  const latestRef = useRef({ todayDayIndex, calendarOrigin, isDark, reminders, protectionWindows });
  latestRef.current = { todayDayIndex, calendarOrigin, isDark, reminders, protectionWindows };

  const scheduleWidgetRefresh = useCallback(() => {
    scheduleWrite(
      WIDGET_REFRESH_KEY,
      () => {
        const { todayDayIndex: dayIndex, calendarOrigin: origin, isDark: dark, reminders: tasks, protectionWindows: windows } =
          latestRef.current;
        const ledger = selectWidgetLedgerView(getSnapshot(), origin, windows);
        void publishWidgetSnapshot({
          todayDayIndex: dayIndex,
          origin,
          dark,
          momentumScore: ledger.todayMomentumScore,
          habits: ledger.activeHabits,
          reminders: tasks,
          momentumEvents: ledger.momentumEvents,
          completionEvents: ledger.completionEvents,
          graceHabitIds: ledger.graceHabitIds,
        }).catch(() => {});
      },
      WIDGET_REFRESH_DEBOUNCE_MS
    );
  }, [getSnapshot]);

  useEffect(() => subscribe(scheduleWidgetRefresh), [subscribe, scheduleWidgetRefresh]);
  // Everything else the widget shows (and the ledger as rendered, which also covers the first publish).
  useEffect(scheduleWidgetRefresh, [
    scheduleWidgetRefresh,
    todayMomentumScore,
    activeHabits,
    reminders,
    todayDayIndex,
    calendarOrigin,
    isDark,
    protectionWindows,
  ]);
  useEffect(() => () => flushWrite(WIDGET_REFRESH_KEY), []);

  const hasSession = Boolean(session);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void schedulePsychologyNotifications({
        // Nobody signed in: all windows off, which cancels the nudges.
        windows: hasSession ? notificationWindows : NO_NOTIFICATION_WINDOWS,
        habits: activeHabits,
        todayIndex: todayDayIndex,
        momentumScore: todayMomentumScore,
      });
    }, NOTIFICATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [hasSession, notificationWindows, activeHabits, todayDayIndex, todayMomentumScore, completionEvents]);

  useEffect(() => {
    if (!isOnboarded && onboardingStep < 3) return;
    void syncAllHabitTargetNotifications(habits, todayDayIndex);
  }, [habits, todayDayIndex, completionEvents, isOnboarded, onboardingStep]);

  return <>{children}</>;
}
