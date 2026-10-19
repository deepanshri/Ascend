import { describe, expect, it } from 'vitest';
import { planWidgetAction, planWidgetRoute } from './widgetIntents';

describe('planWidgetAction', () => {
  const logged = (id: string) => id === 'done';

  it('completes or resets a habit only when the widget state differs from the app', () => {
    expect(planWidgetAction({ type: 'habit', id: 'todo', completed: true }, logged)).toEqual({ kind: 'completeHabit', habitId: 'todo' });
    expect(planWidgetAction({ type: 'habit', id: 'done', completed: false }, logged)).toEqual({ kind: 'resetHabit', habitId: 'done' });
    expect(planWidgetAction({ type: 'habit', id: 'done', completed: true }, logged)).toEqual({ kind: 'none' });
    expect(planWidgetAction({ type: 'habit', id: 'todo', completed: false }, logged)).toEqual({ kind: 'none' });
  });

  it('passes reminder taps through and ignores malformed actions', () => {
    expect(planWidgetAction({ type: 'reminder', id: 'r1', completed: true }, logged)).toEqual({
      kind: 'setReminderCompleted',
      reminderId: 'r1',
      completed: true,
    });
    expect(planWidgetAction(null, logged)).toEqual({ kind: 'none' });
    expect(planWidgetAction({ type: 'habit', id: '', completed: true }, logged)).toEqual({ kind: 'none' });
  });

  it('sends a habit tap made on an earlier day to that day, not today', () => {
    const tap = { type: 'habit' as const, id: 'todo', completed: true, date: '2026-10-17', tappedAt: 1 };
    expect(planWidgetAction(tap, logged, '2026-10-18')).toEqual({
      kind: 'pastDayHabitTap',
      habitId: 'todo',
      date: '2026-10-17',
      completed: true,
      tappedAt: 1,
    });
    // Whether today is logged doesn't matter for a tap from another day.
    expect(planWidgetAction({ ...tap, id: 'done', completed: false }, logged, '2026-10-18')).toMatchObject({
      kind: 'pastDayHabitTap',
      habitId: 'done',
      completed: false,
    });
    expect(planWidgetAction({ ...tap, date: '2026-10-18' }, logged, '2026-10-18')).toEqual({
      kind: 'completeHabit',
      habitId: 'todo',
    });
  });

  it('sets aside a tap dated after today (the clock moved back)', () => {
    const tap = { type: 'habit' as const, id: 'todo', completed: true, date: '2026-10-19', tappedAt: 1 };
    expect(planWidgetAction(tap, logged, '2026-10-18')).toEqual({
      kind: 'expiredHabitTap',
      habitId: 'todo',
      date: '2026-10-19',
      completed: true,
    });
  });

  it('applies undated taps (older widget builds) and reminder taps from any day', () => {
    expect(planWidgetAction({ type: 'habit', id: 'todo', completed: true }, logged, '2026-10-18')).toEqual({
      kind: 'completeHabit',
      habitId: 'todo',
    });
    expect(
      planWidgetAction({ type: 'reminder', id: 'r1', completed: true, date: '2026-10-17' }, logged, '2026-10-18')
    ).toEqual({ kind: 'setReminderCompleted', reminderId: 'r1', completed: true });
  });
});

describe('planWidgetRoute', () => {
  it('maps each deep link to its steps in order', () => {
    expect(planWidgetRoute({ tab: 'reminders', reminderId: 'r1', openCreate: true }, false)).toEqual([
      { kind: 'showTab', tab: 'reminders' },
      { kind: 'focusReminder', reminderId: 'r1' },
      { kind: 'openCreateTask' },
    ]);
    expect(planWidgetRoute({ tab: 'ledger' }, false)).toEqual([{ kind: 'showTab', tab: 'personal' }, { kind: 'openLedger' }]);
    expect(planWidgetRoute(null, false)).toEqual([]);
  });

  it('does not open Add Habit at the active-habit cap', () => {
    expect(planWidgetRoute({ tab: 'home', openCreate: true, habitId: 'h' }, true)).toEqual([
      { kind: 'showTab', tab: 'home' },
      { kind: 'openHabit', habitId: 'h' },
    ]);
  });
});
