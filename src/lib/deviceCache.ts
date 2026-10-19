import { removeStorage } from './storage';

/** Last day the vision reminder was shown (once per day). */
export const VISION_REMINDER_LAST_DATE_KEY = 'ascend_vision_reminder_last_date';

/** Settings → Clear cache: drop caches and once-a-day markers, never the ledger. */
export function clearDeviceCaches(): void {
  for (const key of [
    'ascend_reminders_cache',
    'ascend_habit_logs_cache',
    'ascend_chronicle_entries',
    'ascend_chronicle',
    VISION_REMINDER_LAST_DATE_KEY,
    'ascend_reminders',
    'ascend_cache_timestamp',
  ]) {
    removeStorage(key);
  }
}
