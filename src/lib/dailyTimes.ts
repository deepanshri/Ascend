/**
 * How many days ahead a daily notification is queued as separate one-shot alarms.
 *
 * One-shots instead of the plugin's daily repeat (`schedule.on`): after a repeat
 * fires, the plugin re-arms the next one with a plain RTC alarm that is not
 * idle-allowed, so from the second day on it can wait in Doze until the phone
 * wakes. Each one-shot keeps `allowWhileIdle`. The queue is topped up whenever the
 * app reschedules (launch, day rollover, habit or setting changes).
 */
export const DAYS_QUEUED = 7;

export interface DailySlot {
  /** Days from today: 0 = today. */
  offset: number;
  at: Date;
}

/**
 * The next fire times of a daily local wall-clock time, one per day for `days`
 * days starting today. Times not strictly after `now` are left out.
 */
export function upcomingDailySlots(
  hour: number,
  minute: number,
  now: Date = new Date(),
  days: number = DAYS_QUEUED
): DailySlot[] {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return [];
  const slots: DailySlot[] = [];
  for (let offset = 0; offset < days; offset++) {
    // Built from calendar fields, so a DST change keeps the wall-clock time.
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute, 0, 0);
    if (at.getTime() > now.getTime()) slots.push({ offset, at });
  }
  return slots;
}
