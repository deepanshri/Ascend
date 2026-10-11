import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Habit, MomentumEvent } from '../types';
import { computeDayRollover, missedHabitsOn, type DayRolloverInput } from './dayRollover';

const habit = (id: string, fields: Partial<Habit> = {}): Habit =>
  ({ id, name: `Habit ${id}`, category: 'work', timestamp: '', days: [], targetDaysPerWeek: 7, ...fields }) as Habit;

const logged = (habitId: string, loggedDate: string): MomentumEvent =>
  ({ id: `${habitId}-${loggedDate}`, habitId, eventType: 'full', weight: 1, loggedDate, timestamp: 0 }) as unknown as MomentumEvent;

const base = (overrides: Partial<DayRolloverInput> = {}): DayRolloverInput => ({
  todayIso: '2026-10-12',
  lastActiveIso: '2026-10-11',
  habits: [habit('a')],
  momentumEvents: [],
  protectionPaused: false,
  processMissedDays: true,
  ...overrides,
});

describe('computeDayRollover: no rollover', () => {
  it('first run records today and changes nothing', () => {
    expect(computeDayRollover(base({ lastActiveIso: null }))).toEqual({
      dayChanged: false,
      lastActiveIso: '2026-10-12',
      clearActiveFallbacks: false,
      missed: [],
      graceHabitIds: null,
      frictionPrompts: [],
    });
  });

  it('an unreadable stored day is replaced by today', () => {
    const result = computeDayRollover(base({ lastActiveIso: '10/11/2026' }));
    expect(result.dayChanged).toBe(false);
    expect(result.lastActiveIso).toBe('2026-10-12');
  });

  it('the same day changes nothing and keeps fallback mode', () => {
    const result = computeDayRollover(base({ lastActiveIso: '2026-10-12' }));
    expect(result.dayChanged).toBe(false);
    expect(result.clearActiveFallbacks).toBe(false);
  });

  it('a clock or timezone moving backwards never moves the last active day back', () => {
    const result = computeDayRollover(base({ todayIso: '2026-10-11', lastActiveIso: '2026-10-12' }));
    expect(result.dayChanged).toBe(false);
    expect(result.lastActiveIso).toBe('2026-10-12');
    expect(result.missed).toEqual([]);
  });

  it('after moving back and forward again, each day is processed once', () => {
    const back = computeDayRollover(base({ todayIso: '2026-10-11', lastActiveIso: '2026-10-12' }));
    const forward = computeDayRollover(base({ todayIso: '2026-10-12', lastActiveIso: back.lastActiveIso }));
    expect(forward.dayChanged).toBe(false);
    const nextDay = computeDayRollover(base({ todayIso: '2026-10-13', lastActiveIso: forward.lastActiveIso }));
    expect(nextDay.frictionPrompts.map((p) => p.loggedDate)).toEqual(['2026-10-12']);
  });
});

describe('computeDayRollover: one day later', () => {
  it('offers yesterday’s missed habits a grace rollover instead of a hard miss', () => {
    const result = computeDayRollover(base({ habits: [habit('a'), habit('b')] }));
    expect(result).toMatchObject({ dayChanged: true, lastActiveIso: '2026-10-12', clearActiveFallbacks: true });
    expect(result.graceHabitIds).toEqual(['a', 'b']);
    expect(result.missed).toEqual([]);
    expect(result.frictionPrompts).toEqual([
      { habitId: 'a', habitName: 'Habit a', loggedDate: '2026-10-11' },
      { habitId: 'b', habitName: 'Habit b', loggedDate: '2026-10-11' },
    ]);
  });

  it('skips habits logged, archived or not scheduled that day', () => {
    // 2026-10-11 is a Sunday (Monday-first index 6).
    const result = computeDayRollover(
      base({
        habits: [habit('done'), habit('archived', { archived: true }), habit('weekdays', { scheduledDays: [0, 1, 2, 3, 4] }), habit('due')],
        momentumEvents: [logged('done', '2026-10-11')],
      })
    );
    expect(result.graceHabitIds).toEqual(['due']);
  });
});

describe('computeDayRollover: several days later', () => {
  it('records every missed day as a hard miss, oldest first, and clears grace', () => {
    const result = computeDayRollover(base({ todayIso: '2026-10-14', lastActiveIso: '2026-10-11' }));
    expect(result.missed).toEqual([
      { habitId: 'a', habitName: 'Habit a', isoDate: '2026-10-11' },
      { habitId: 'a', habitName: 'Habit a', isoDate: '2026-10-12' },
      { habitId: 'a', habitName: 'Habit a', isoDate: '2026-10-13' },
    ]);
    expect(result.graceHabitIds).toEqual([]);
    expect(result.frictionPrompts).toHaveLength(3);
  });

  it('counts nothing while Exam Shield or Vacation is active', () => {
    const result = computeDayRollover(base({ todayIso: '2026-10-14', protectionPaused: true }));
    expect(result).toMatchObject({ dayChanged: true, missed: [], frictionPrompts: [], graceHabitIds: [] });
  });

  it('only advances the day when missed-day processing is off', () => {
    const result = computeDayRollover(base({ todayIso: '2026-10-14', processMissedDays: false }));
    expect(result).toMatchObject({ dayChanged: true, lastActiveIso: '2026-10-14', missed: [], graceHabitIds: null });
  });

  it('does not mutate its inputs', () => {
    const input = base({ todayIso: '2026-10-14' });
    const snapshot = JSON.stringify(input);
    computeDayRollover(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('computeDayRollover across DST changes', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('counts each calendar day exactly once over spring forward', () => {
    const result = computeDayRollover(base({ todayIso: '2026-03-10', lastActiveIso: '2026-03-07' }));
    expect(result.missed.map((m) => m.isoDate)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });

  it('counts each calendar day exactly once over fall back', () => {
    const result = computeDayRollover(base({ todayIso: '2026-11-03', lastActiveIso: '2026-10-31' }));
    expect(result.missed.map((m) => m.isoDate)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  });
});

describe('missedHabitsOn', () => {
  it('ignores malformed dates', () => {
    expect(missedHabitsOn([habit('a')], [], 'nope')).toEqual([]);
  });
});
