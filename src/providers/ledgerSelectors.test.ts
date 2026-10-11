import { describe, expect, it } from 'vitest';
import type { Habit, HabitCompletionEvent } from '../types';
import { EMPTY_LEDGER } from './ledgerReducer';
import { selectActiveHabits, selectDerivedHabits, selectTodayMomentumEvents, selectWidgetLedgerView } from './ledgerSelectors';

const ORIGIN = new Date(2026, 9, 11);
const habit = (id: string, fields: Partial<Habit> = {}) =>
  ({ id, name: id, category: 'work', timestamp: '08:00 AM', days: [], targetDaysPerWeek: 7, ...fields }) as Habit;
const done: HabitCompletionEvent = { id: 'c1', habitId: 'a', dayIndex: 3, date: '2026-10-11', type: 'full', timestamp: ORIGIN.getTime() + 3_600_000 };

describe('ledger selectors', () => {
  const state = { ...EMPTY_LEDGER, habits: [habit('a'), habit('old', { archived: true })], completionEvents: [done], rolledOverHabits: ['a'] };

  it('replays the completion log onto the week and drops archived habits', () => {
    const derived = selectDerivedHabits(state, ORIGIN);
    expect(derived.find((h) => h.id === 'a')?.days?.[3]).toBe(true);
    expect(selectActiveHabits(derived).map((h) => h.id)).toEqual(['a']);
  });

  it('counts a logged completion as a momentum vote even before the momentum log has it', () => {
    expect(selectTodayMomentumEvents(state, ORIGIN).map((e) => [e.habitId, e.eventType])).toEqual([['a', 'full']]);
  });

  it('gives the widget everything from one snapshot', () => {
    const view = selectWidgetLedgerView(state, ORIGIN, []);
    expect(view.activeHabits.map((h) => h.id)).toEqual(['a']);
    expect(view.todayMomentumScore).toBeGreaterThan(0);
    expect(view.graceHabitIds).toEqual(['a']);
    expect(view.completionEvents).toBe(state.completionEvents);
  });
});
