import React, { useEffect } from 'react';
import { flushWrite, scheduleWrite } from '../lib/pendingWrites';
import { hideNativeSplash } from '../lib/nativeChrome';
import { schedulePsychologyNotifications, syncAllHabitTargetNotifications } from '../lib/notifications';
import { publishWidgetSnapshot } from '../lib/widgetSync';
import { useCalendar } from './CalendarProvider';
import { useLedger } from './HabitLedgerProvider';
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
  const { habits, activeHabits, completionEvents, momentumEvents, rolledOverHabits, todayMomentumScore } = useLedger();

  useEffect(() => {
    const timer = window.setTimeout(() => void hideNativeSplash().catch(() => {}), SPLASH_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Widget snapshot. Scheduled through the pending-writes registry rather than
  // a bare timer: when the OS backgrounds the app inside the debounce window,
  // installBackgroundFlush publishes it immediately, so the widget never keeps
  // stale data. A sign-out purge discards it with every other pending write.
  useEffect(() => {
    const input = {
      todayDayIndex,
      origin: calendarOrigin,
      dark: isDark,
      momentumScore: todayMomentumScore,
      habits: activeHabits,
      reminders,
      momentumEvents,
      completionEvents,
      graceHabitIds: rolledOverHabits,
    };
    scheduleWrite(
      WIDGET_REFRESH_KEY,
      () => void publishWidgetSnapshot(input).catch(() => {}),
      WIDGET_REFRESH_DEBOUNCE_MS
    );
  }, [todayMomentumScore, activeHabits, reminders, todayDayIndex, calendarOrigin, completionEvents, momentumEvents, isDark, rolledOverHabits]);
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
    void syncAllHabitTargetNotifications(habits, todayDayIndex, calendarOrigin);
  }, [habits, todayDayIndex, calendarOrigin, completionEvents, isOnboarded, onboardingStep]);

  return <>{children}</>;
}
