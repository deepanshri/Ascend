import { useEffect } from 'react';
import { getChronicleEntry } from '../lib/chronicle';
import { scheduleChronicleReminders } from '../lib/notifications';
import { useCalendar } from './CalendarProvider';
import { usePreferences } from './PreferencesProvider';
import { useSession } from './SessionProvider';
import { useUI } from './UIProvider';

const NOTIFICATION_DEBOUNCE_MS = 500;
const CHRONICLE_OFF = { enabled: false, time: '20:00' };

/**
 * Keeps the Evening Chronicle reminder in step with Settings and today's entry.
 * Lives inside UIProvider, which owns chronicleVersion (bumped on every save).
 * Renders nothing.
 */
export function ChronicleReminderSync() {
  const { session } = useSession();
  const { eveningChronicle } = usePreferences();
  const { todayIso } = useCalendar();
  const { chronicleVersion } = useUI();

  const hasSession = Boolean(session);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void scheduleChronicleReminders(
        // Nobody signed in: treat the feature as off, which cancels the reminders.
        hasSession ? eveningChronicle : CHRONICLE_OFF,
        Boolean(getChronicleEntry(todayIso))
      );
    }, NOTIFICATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [hasSession, eveningChronicle, todayIso, chronicleVersion]);

  return null;
}
