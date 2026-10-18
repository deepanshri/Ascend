import type { EveningChronicleSettings } from './chronicle';
import { DAYS_QUEUED, upcomingDailySlots } from './dailyTimes';

/** How many evenings ahead are queued, so the reminder keeps firing while the app stays closed. */
export const CHRONICLE_REMINDER_DAYS = DAYS_QUEUED;

/**
 * Fire times for the Evening Chronicle reminder: one per evening at the configured
 * local time, for the next CHRONICLE_REMINDER_DAYS days. Tonight is skipped once
 * today's entry is saved or the time has already passed. Empty when the feature is off.
 */
export function chronicleReminderTimes(
  settings: EveningChronicleSettings,
  completedToday: boolean,
  now: Date = new Date(),
  days: number = CHRONICLE_REMINDER_DAYS
): Date[] {
  if (!settings.enabled) return [];
  const [hours, minutes] = settings.time.split(':').map(Number);
  return upcomingDailySlots(hours, minutes, now, days)
    .filter((slot) => !(slot.offset === 0 && completedToday))
    .map((slot) => slot.at);
}
