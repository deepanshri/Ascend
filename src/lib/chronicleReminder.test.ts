import { describe, expect, it } from 'vitest';
import { CHRONICLE_REMINDER_DAYS, chronicleReminderTimes } from './chronicleReminder';

const on = { enabled: true, time: '20:00' };
// Local time, so the assertions hold in any timezone.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m, 0, 0);

describe('chronicleReminderTimes', () => {
  it('is empty when the feature is off', () => {
    expect(chronicleReminderTimes({ enabled: false, time: '20:00' }, false, at(18, 9))).toEqual([]);
  });

  it('queues tonight and the following evenings at the configured time', () => {
    const times = chronicleReminderTimes(on, false, at(18, 9));
    expect(times).toHaveLength(CHRONICLE_REMINDER_DAYS);
    expect(times[0]).toEqual(at(18, 20));
    expect(times[CHRONICLE_REMINDER_DAYS - 1]).toEqual(at(24, 20));
  });

  it('skips tonight once today is saved', () => {
    const times = chronicleReminderTimes(on, true, at(18, 9));
    expect(times).toHaveLength(CHRONICLE_REMINDER_DAYS - 1);
    expect(times[0]).toEqual(at(19, 20));
  });

  it('skips tonight once the time has passed', () => {
    expect(chronicleReminderTimes(on, false, at(18, 20, 1))[0]).toEqual(at(19, 20));
    expect(chronicleReminderTimes(on, false, at(18, 20))[0]).toEqual(at(19, 20));
  });

  it('uses the configured minutes and rolls over month ends', () => {
    const times = chronicleReminderTimes({ enabled: true, time: '21:45' }, false, at(30, 22));
    expect(times[0]).toEqual(new Date(2026, 9, 31, 21, 45));
    expect(times[1]).toEqual(new Date(2026, 10, 1, 21, 45));
  });

  it('is empty for a malformed time', () => {
    expect(chronicleReminderTimes({ enabled: true, time: 'soon' }, false, at(18, 9))).toEqual([]);
  });
});
