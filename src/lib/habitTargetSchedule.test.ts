import { describe, expect, it } from 'vitest';
import type { Habit } from '../types';
import { DAYS_QUEUED } from './dailyTimes';
import {
  HABIT_TARGET_LEAD_MS,
  habitTargetNotificationIds,
  legacyHabitTargetNotificationId,
  planHabitTargetNotifications,
} from './habitTargetSchedule';

// Sunday 18 Oct 2026, local time.
const at = (day: number, h: number, m = 0, s = 0) => new Date(2026, 9, day, h, m, s, 0);
const habit = (fields: Partial<Habit> = {}) =>
  ({ id: 'h1', targetTime: '18:00', archived: false, ...fields }) as Habit;

describe('planHabitTargetNotifications', () => {
  it('queues a heads-up 15 minutes before the target on each of the coming days', () => {
    const planned = planHabitTargetNotifications(habit(), false, at(18, 9));
    expect(planned).toHaveLength(DAYS_QUEUED);
    expect(planned[0].at).toEqual(at(18, 17, 45));
    expect(planned[6].at).toEqual(at(24, 17, 45));
    expect(planned.every((p) => p.at.getTime() === at(18 + p.offset, 18).getTime() - HABIT_TARGET_LEAD_MS)).toBe(true);
  });

  it('completing today drops only today; the following days stay queued', () => {
    const planned = planHabitTargetNotifications(habit(), true, at(18, 9));
    expect(planned.map((p) => p.offset)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('skips days the habit is not scheduled on', () => {
    // Mondays and Wednesdays only (0 = Mon): the 19th and 21st.
    const planned = planHabitTargetNotifications(habit({ scheduledDays: [0, 2] }), false, at(18, 9));
    expect(planned.map((p) => p.at.getDate())).toEqual([19, 21]);
  });

  it('fires almost at once when only the heads-up slot has passed today', () => {
    const now = at(18, 17, 50);
    const planned = planHabitTargetNotifications(habit(), false, now);
    expect(planned[0].offset).toBe(0);
    expect(planned[0].at.getTime() - now.getTime()).toBe(5000);
  });

  it('skips today once the target time has passed', () => {
    const planned = planHabitTargetNotifications(habit(), false, at(18, 18, 0, 1));
    expect(planned[0].offset).toBe(1);
  });

  it('accepts 12-hour target times', () => {
    const planned = planHabitTargetNotifications(habit({ targetTime: '07:30 PM' }), false, at(18, 9));
    expect(planned[0].at).toEqual(at(18, 19, 15));
  });

  it('is empty for an archived habit or a missing/invalid target time', () => {
    expect(planHabitTargetNotifications(habit({ archived: true }), false, at(18, 9))).toEqual([]);
    expect(planHabitTargetNotifications(habit({ targetTime: undefined }), false, at(18, 9))).toEqual([]);
    expect(planHabitTargetNotifications(habit({ targetTime: 'soon' }), false, at(18, 9))).toEqual([]);
  });

  it('every planned id belongs to the habit and is unique', () => {
    const ids = habitTargetNotificationIds('h1');
    const planned = planHabitTargetNotifications(habit(), false, at(18, 9));
    expect(planned.map((p) => p.id)).toEqual(ids);
  });
});

describe('habitTargetNotificationIds', () => {
  it('gives each habit DAYS_QUEUED consecutive ids inside 100000–199999', () => {
    for (const id of ['h1', 'a-much-longer-habit-id', 'b6f2c1d0-8f1e-4c4e-9a51-2f3d4e5a6b7c']) {
      const ids = habitTargetNotificationIds(id);
      expect(ids).toHaveLength(DAYS_QUEUED);
      expect(ids[DAYS_QUEUED - 1] - ids[0]).toBe(DAYS_QUEUED - 1);
      expect(ids[0]).toBeGreaterThanOrEqual(100000);
      expect(ids[DAYS_QUEUED - 1]).toBeLessThanOrEqual(199999);
    }
  });

  it('keeps the old single id in the same range, for cancelling alarms older builds left', () => {
    const legacy = legacyHabitTargetNotificationId('h1');
    expect(legacy).toBeGreaterThanOrEqual(100000);
    expect(legacy).toBeLessThanOrEqual(199999);
  });
});
