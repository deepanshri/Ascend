import { useEffect } from 'react';
import { VISION_REMINDER_LAST_DATE_KEY } from '../lib/deviceCache';
import { readStorage, writeStorage } from '../lib/storage';
import { getUserVisionStatement } from '../lib/vision';
import { useCalendar } from '../providers/CalendarProvider';
import { useUI, useUIActions } from '../providers/UIProvider';

/** Deferred just past first paint. */
const LAUNCH_DELAY_MS = 150;

/** Once a day, the first time Home shows, remind the user of their vision statement. */
export function useVisionReminder(): void {
  const { activeTab } = useUI();
  const { openModal } = useUIActions();
  const { todayIso } = useCalendar();

  useEffect(() => {
    if (activeTab !== 'home') return;
    const timer = window.setTimeout(() => {
      if (readStorage(VISION_REMINDER_LAST_DATE_KEY) === todayIso) return;
      writeStorage(VISION_REMINDER_LAST_DATE_KEY, todayIso);
      openModal({ kind: 'visionReminder', text: getUserVisionStatement() });
    }, LAUNCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeTab, todayIso, openModal]);
}
