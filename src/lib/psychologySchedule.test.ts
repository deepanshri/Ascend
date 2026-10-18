import { describe, expect, it } from 'vitest';
import type { Habit } from '../types';
import { DAYS_QUEUED, upcomingDailySlots } from './dailyTimes';
import { PSYCHOLOGY_WINDOWS, planPsychologyNotifications, psychologyNotificationIds } from './psychologySchedule';

// Sunday 18 Oct 2026, 09:00 local: morning has passed, afternoon and night are still ahead.
const now = new Date(2026, 9, 18, 9, 0);
const allOn = { morning: true, afternoon: true, night: true };
const habit = (fields: Partial<Habit>) =>
  ({ id: 'h', name: 'Read', days: [], archived: false, ...fields }) as unknown as Habit;

describe('upcomingDailySlots', () => {
  it('queues one slot per day, dropping a time already past today', () => {
    const slots = upcomingDailySlots(6, 0, now);
    expect(slots.map((s) => s.offset)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(slots[0].at).toEqual(new Date(2026, 9, 19, 6, 0));
  });

  it('keeps today when the time is still ahead', () => {
    const slots = upcomingDailySlots(13, 30, now);
    expect(slots).toHaveLength(DAYS_QUEUED);
    expect(slots[0]).toEqual({ offset: 0, at: new Date(2026, 9, 18, 13, 30) });
  });
});

describe('planPsychologyNotifications', () => {
  it('schedules only enabled windows, as one-shots at future times', () => {
    const planned = planPsychologyNotifications({ morning: false, afternoon: true, night: false }, [habit({})], 0, now);
    expect(planned).toHaveLength(DAYS_QUEUED);
    expect(planned.every((p) => p.at.getHours() === 13 && p.at.getMinutes() === 30)).toBe(true);
    expect(planned.every((p) => p.at.getTime() > now.getTime())).toBe(true);
  });

  it('gives each day its own id within the window range', () => {
    const planned = planPsychologyNotifications(allOn, [habit({})], 0, now);
    const ids = planned.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(psychologyNotificationIds()).toContain(id);
    // Tomorrow's morning is offset 1 from the base id.
    expect(planned.find((p) => p.at.getDate() === 19 && p.at.getHours() === 6)?.id).toBe(
      PSYCHOLOGY_WINDOWS.morning.baseId + 1
    );
  });

  it("uses today's check-offs today and treats later days as not started", () => {
    // Today (dayIndex 6 = Sunday) is done; the habit is scheduled every day.
    const done = habit({ days: [false, false, false, false, false, false, true] });
    const nights = planPsychologyNotifications({ morning: false, afternoon: false, night: true }, [done], 6, now);
    expect(nights[0].title).toBe('All Done for Today!');
    expect(nights[1].title).toBe('Still Open Today • Read');
  });

  it("counts a later day's habits by that day's weekday", () => {
    // Scheduled Mondays only (0 = Mon): tomorrow (Mon 19th) has it open, Tuesday does not.
    const mondays = habit({ name: 'Gym', scheduledDays: [0] });
    const nights = planPsychologyNotifications({ morning: false, afternoon: false, night: true }, [mondays], 6, now);
    expect(nights[1].title).toBe('Still Open Today • Gym');
    expect(nights[2].title).toBe('All Done for Today!');
  });

  it('covers every id an older build used for its daily repeat', () => {
    const ids = psychologyNotificationIds();
    expect(ids).toEqual(expect.arrayContaining([81000, 81300, 20300]));
    expect(ids).toHaveLength(3 * DAYS_QUEUED);
  });
});
