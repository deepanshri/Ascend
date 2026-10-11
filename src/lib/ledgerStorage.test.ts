import { describe, expect, it } from 'vitest';
import {
  parseStoredCompletionEvents,
  parseStoredEvidence,
  parseStoredFrictionAudits,
  parseStoredHabits,
  parseStoredMomentumEvents,
  parseStoredReminders,
  parseStoredRolledOverHabits,
  parseStoredStringList,
  serializeRolledOverHabits,
} from './ledgerStorage';

const json = (value: unknown) => JSON.stringify(value);

const listParsers = {
  parseStoredHabits,
  parseStoredCompletionEvents,
  parseStoredMomentumEvents,
  parseStoredEvidence,
  parseStoredReminders,
  parseStoredFrictionAudits,
  parseStoredStringList,
};

describe.each(Object.entries(listParsers))('%s payload handling', (_name, parse) => {
  it('treats a missing payload as nothing stored', () => {
    expect(parse(null)).toEqual({ items: null, rejected: [] });
    expect(parse('')).toEqual({ items: null, rejected: [] });
  });

  it('keeps an empty list', () => {
    expect(parse('[]')).toEqual({ items: [], rejected: [] });
  });

  it('rejects unparseable JSON with the raw string', () => {
    expect(parse('{not json')).toEqual({
      items: null,
      rejected: [{ reason: 'invalid_json', value: '{not json' }],
    });
  });

  it.each([{ a: 1 }, 5, 'text'])('rejects a non-list payload %j as a whole', (payload) => {
    expect(parse(json(payload))).toEqual({
      items: null,
      rejected: [{ reason: 'not_a_list', value: payload }],
    });
  });
});

describe('parseStoredHabits', () => {
  it('rejects entries without a usable id instead of throwing', () => {
    const bad = [null, 'junk', 7, ['x'], { name: 'no id' }, { id: '' }, { id: 42 }];
    const result = parseStoredHabits(json([...bad, { id: 'user-1', name: 'Read', category: 'work', timestamp: '' }]));
    expect(result.items?.map((habit) => habit.id)).toEqual(['user-1']);
    expect(result.rejected).toEqual(bad.map((value) => ({ reason: 'invalid_entry', value })));
  });

  it('drops seed and onboarding habits without rejecting them', () => {
    const result = parseStoredHabits(
      json([
        { id: 'habit-1', name: 'seed', category: 'work', timestamp: '' },
        { id: 'habit-onboarding-x', name: 'onboarding', category: 'work', timestamp: '' },
      ])
    );
    expect(result).toEqual({ items: [], rejected: [] });
  });

  it('normalizes category, badge tag, week arrays and time of day', () => {
    const [habit] = parseStoredHabits(
      json([{ id: 'user-1', name: 'Ship', category: 'Work', timestamp: '9 PM', tags: ['stale'] }])
    ).items!;
    expect(habit.category).toBe('work');
    expect(habit.tags).toEqual(['W']);
    expect(habit.days).toEqual([false, false, false, false, false, false, false]);
    expect(habit.microDays).toEqual([false, false, false, false, false, false, false]);
    expect(habit.timeOfDay).toBe('night');
  });

  it('keeps stored week arrays and an explicit time of day', () => {
    const days = [true, false, true, false, false, false, false];
    const [habit] = parseStoredHabits(
      json([{ id: 'user-1', name: 'Run', category: 'x', timestamp: '9 PM', timeOfDay: 'morning', days }])
    ).items!;
    expect(habit.category).toBe('self_improvement');
    expect(habit.days).toEqual(days);
    expect(habit.timeOfDay).toBe('morning');
  });

  it('does not share the default week array between habits', () => {
    const [a, b] = parseStoredHabits(
      json([
        { id: 'a', name: 'A', category: 'work', timestamp: '' },
        { id: 'b', name: 'B', category: 'work', timestamp: '' },
      ])
    ).items!;
    expect(a.days).not.toBe(b.days);
  });
});

describe.each([
  ['parseStoredCompletionEvents', parseStoredCompletionEvents],
  ['parseStoredMomentumEvents', parseStoredMomentumEvents],
  ['parseStoredEvidence', parseStoredEvidence],
] as const)('%s', (_name, parse) => {
  it('drops seed-habit rows and rejects rows without a habitId', () => {
    const result = parse(json([{ id: '1', habitId: 'habit-2' }, { id: '2', habitId: 'user-1' }, { id: '3' }, null]));
    expect(result.items?.map((row) => row.id)).toEqual(['2']);
    expect(result.rejected).toEqual([
      { reason: 'invalid_entry', value: { id: '3' } },
      { reason: 'invalid_entry', value: null },
    ]);
  });
});

describe('parseStoredEvidence', () => {
  it('normalizes legacy categories', () => {
    const { items } = parseStoredEvidence(
      json([
        { id: 'e1', habitId: 'user-1', category: 'Work' },
        { id: 'e2', habitId: 'manual', category: 'other' },
      ])
    );
    expect(items?.map((item) => item.category)).toEqual(['work', 'self_improvement']);
  });
});

describe('parseStoredReminders', () => {
  it('drops the retired demo reminders and rejects reminders without an id', () => {
    const result = parseStoredReminders(json([{ id: 'rem-1' }, { id: 'rem-2' }, { id: 'rem-3' }, { id: 9 }, { title: 'x' }]));
    expect(result.items?.map((item) => item.id)).toEqual(['rem-3', 9]);
    expect(result.rejected).toEqual([{ reason: 'invalid_entry', value: { title: 'x' } }]);
  });
});

describe('parseStoredFrictionAudits', () => {
  it('rejects non-object entries', () => {
    expect(parseStoredFrictionAudits(json([{ id: 'fa-1' }, 3, null]))).toEqual({
      items: [{ id: 'fa-1' }],
      rejected: [
        { reason: 'invalid_entry', value: 3 },
        { reason: 'invalid_entry', value: null },
      ],
    });
  });
});

describe('parseStoredStringList', () => {
  it('keeps strings and rejects everything else', () => {
    expect(parseStoredStringList(json(['Books', 7, null, 'Anime']))).toEqual({
      items: ['Books', 'Anime'],
      rejected: [
        { reason: 'invalid_entry', value: 7 },
        { reason: 'invalid_entry', value: null },
      ],
    });
  });
});

describe('rolled-over habits', () => {
  const today = '2026-10-11';

  it('round-trips through serialize and parse on the same day', () => {
    expect(parseStoredRolledOverHabits(serializeRolledOverHabits(today, ['a', 'b']), today)).toEqual({
      items: ['a', 'b'],
      rejected: [],
    });
  });

  it('treats another day as expired, not malformed', () => {
    expect(parseStoredRolledOverHabits(serializeRolledOverHabits('2026-10-10', ['a']), today)).toEqual({
      items: null,
      rejected: [],
    });
  });

  it('rejects malformed payloads and non-string ids', () => {
    expect(parseStoredRolledOverHabits(null, today)).toEqual({ items: null, rejected: [] });
    expect(parseStoredRolledOverHabits('nope', today).rejected).toEqual([{ reason: 'invalid_json', value: 'nope' }]);
    expect(parseStoredRolledOverHabits(json(['a']), today).rejected).toEqual([
      { reason: 'invalid_entry', value: ['a'] },
    ]);
    expect(parseStoredRolledOverHabits(json({ date: today, habitIds: ['a', 1] }), today)).toEqual({
      items: ['a'],
      rejected: [{ reason: 'invalid_entry', value: 1 }],
    });
  });
});
