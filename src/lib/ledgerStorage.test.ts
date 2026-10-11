import { describe, expect, it } from 'vitest';
import {
  parseStoredCompletionEvents,
  parseStoredEvidence,
  parseStoredFrictionAudits,
  parseStoredHabits,
  parseStoredReminders,
  parseStoredRolledOverHabits,
  parseStoredStringList,
  serializeRolledOverHabits,
} from './ledgerStorage';

const json = (value: unknown) => JSON.stringify(value);

describe('missing or unreadable payloads', () => {
  const parsers = [
    parseStoredHabits,
    parseStoredCompletionEvents,
    parseStoredEvidence,
    parseStoredReminders,
    parseStoredFrictionAudits,
    parseStoredStringList,
  ];

  it.each([null, '', '{not json', json({ a: 1 }), json(5), json('text')])(
    'returns null for %j',
    (raw) => {
      for (const parse of parsers) expect(parse(raw)).toBeNull();
    }
  );

  it('keeps an empty stored list as an empty list', () => {
    for (const parse of parsers) expect(parse('[]')).toEqual([]);
  });
});

describe('parseStoredHabits', () => {
  it('drops seed and onboarding habits and non-object entries', () => {
    const habits = parseStoredHabits(
      json([
        { id: 'habit-1', name: 'seed', category: 'work', timestamp: '08:00 AM', days: [] },
        { id: 'habit-onboarding-x', name: 'onboarding', category: 'work', timestamp: '', days: [] },
        null,
        'junk',
        { id: 'user-1', name: 'Read', category: 'self_improvement', timestamp: '08:00 AM', days: [] },
      ])
    );
    expect(habits?.map((habit) => habit.id)).toEqual(['user-1']);
  });

  it('normalizes category, badge tag, week arrays and time of day', () => {
    const [habit] = parseStoredHabits(
      json([{ id: 'user-1', name: 'Ship', category: 'Work', timestamp: '9 PM', tags: ['stale'] }])
    )!;
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
    )!;
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
    )!;
    expect(a.days).not.toBe(b.days);
  });
});

describe('parseStoredCompletionEvents', () => {
  it('drops seed-habit events and non-object entries', () => {
    const events = parseStoredCompletionEvents(
      json([
        { id: '1', habitId: 'habit-2', dayIndex: 0, type: 'full', timestamp: 1 },
        { id: '2', habitId: 'user-1', dayIndex: 0, type: 'full', timestamp: 2 },
        null,
      ])
    );
    expect(events?.map((event) => event.id)).toEqual(['2']);
  });
});

describe('parseStoredEvidence', () => {
  it('drops seed evidence and normalizes legacy categories', () => {
    const evidence = parseStoredEvidence(
      json([
        { id: 'e1', habitId: 'habit-1', category: 'work' },
        { id: 'e2', habitId: 'user-1', category: 'Work' },
        { id: 'e3', habitId: 'manual', category: 'other' },
      ])
    );
    expect(evidence?.map((item) => [item.id, item.category])).toEqual([
      ['e2', 'work'],
      ['e3', 'self_improvement'],
    ]);
  });
});

describe('parseStoredReminders', () => {
  it('drops the retired demo reminders', () => {
    const reminders = parseStoredReminders(json([{ id: 'rem-1' }, { id: 'rem-2' }, { id: 'rem-3' }]));
    expect(reminders?.map((item) => item.id)).toEqual(['rem-3']);
  });
});

describe('parseStoredFrictionAudits', () => {
  it('drops non-object entries', () => {
    expect(parseStoredFrictionAudits(json([{ id: 'fa-1' }, 3, null]))).toEqual([{ id: 'fa-1' }]);
  });
});

describe('parseStoredStringList', () => {
  it('keeps only strings', () => {
    expect(parseStoredStringList(json(['Books', 7, null, 'Anime']))).toEqual(['Books', 'Anime']);
  });
});

describe('rolled-over habits', () => {
  const today = '2026-10-11';

  it('round-trips through serialize and parse on the same day', () => {
    expect(parseStoredRolledOverHabits(serializeRolledOverHabits(today, ['a', 'b']), today)).toEqual([
      'a',
      'b',
    ]);
  });

  it('expires on any other day', () => {
    expect(parseStoredRolledOverHabits(serializeRolledOverHabits('2026-10-10', ['a']), today)).toBeNull();
  });

  it('rejects malformed payloads and non-string ids', () => {
    expect(parseStoredRolledOverHabits(null, today)).toBeNull();
    expect(parseStoredRolledOverHabits(json(['a']), today)).toBeNull();
    expect(parseStoredRolledOverHabits(json({ date: today, habitIds: 'a' }), today)).toBeNull();
    expect(parseStoredRolledOverHabits(json({ date: today, habitIds: ['a', 1] }), today)).toEqual(['a']);
  });
});
