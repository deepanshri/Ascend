import { describe, expect, it } from 'vitest';
import type { Habit } from '../types';
import { mergeHabitRevisions, omitDeletedRefs } from './habitMerge';
import { appendFrictionPrompts, mergeFrictionAuditsFromLogs } from './frictionAuditCore';

const habit = (id: string, updatedAt: number, name = id): Habit =>
  ({ id, name, category: 'work', timestamp: '', days: [], targetDaysPerWeek: 7, updatedAt }) as Habit;

describe('mergeHabitRevisions', () => {
  it('keeps the newer revision, local on ties, and drops demo and deleted habits', () => {
    const merged = mergeHabitRevisions(
      [habit('a', 2, 'local a'), habit('b', 1, 'local b'), habit('habit-1', 9), habit('gone', 9)],
      [habit('a', 2, 'remote a'), habit('b', 3, 'remote b'), habit('c', 1)],
      new Set(['gone'])
    );
    expect(merged.map((h) => h.name).sort()).toEqual(['c', 'local a', 'remote b']);
  });

  it('keeps local habits when the remote list is empty', () => {
    expect(mergeHabitRevisions([habit('a', 1)], [], new Set()).map((h) => h.id)).toEqual(['a']);
  });
});

describe('omitDeletedRefs', () => {
  it('keeps rows without a habit reference', () => {
    expect(omitDeletedRefs([{ habitId: 'gone' }, { habitId: 'a' }, {}], new Set(['gone']))).toEqual([{ habitId: 'a' }, {}]);
  });
});

describe('friction audit core', () => {
  const prompt = { habitId: 'a', habitName: 'A', loggedDate: '2026-10-10' };

  it('appendFrictionPrompts returns the same list when nothing is new', () => {
    const current = [prompt];
    expect(appendFrictionPrompts(current, [{ ...prompt }])).toBe(current);
  });

  it('mergeFrictionAuditsFromLogs is deterministic for a given time', () => {
    const rows = [{ habitId: 'a', loggedDate: '2026-10-10', reason: ' Low Energy ' }];
    const one = mergeFrictionAuditsFromLogs([], rows, [habit('a', 1, 'Read')], 42);
    expect(one).toEqual(mergeFrictionAuditsFromLogs([], rows, [habit('a', 1, 'Read')], 42));
    expect(one[0]).toMatchObject({ habitName: 'Read', reason: 'Low Energy', timestamp: 42, type: 'missed' });
  });
});
