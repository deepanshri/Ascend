import { useEffect } from 'react';
import { hydrateChronicleFromRemote } from '../lib/chronicleSync';
import { useCalendar } from './CalendarProvider';
import { useSession } from './SessionProvider';
import { useUIActions } from './UIProvider';

/**
 * Reads Chronicle entries back from the account on sign-in and at each new day
 * (after uploading anything queued), so a reinstall or second phone sees the
 * journal. Views re-read through chronicleVersion. Lives inside UIProvider.
 * Renders nothing.
 */
export function ChronicleHydrator() {
  const { session } = useSession();
  const { todayIso } = useCalendar();
  const { markChronicleSaved } = useUIActions();
  const userId = session && !session.isGuest ? session.id : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void hydrateChronicleFromRemote(userId)
      .then((changed) => {
        if (changed && !cancelled) markChronicleSaved();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, todayIso, markChronicleSaved]);

  return null;
}
