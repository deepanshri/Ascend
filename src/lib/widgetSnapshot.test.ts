import { describe, expect, it } from 'vitest';
import type { Habit, HabitCompletionEvent } from '../types';
import { dayIndexForIso, localMidnightOf } from '../utils/dates';
import { buildWidgetSnapshot } from './widgetSnapshot';

// Sunday 18 Oct 2026; tomorrow is Monday the 19th.
const TODAY = '2026-10-18';
const origin = localMidnightOf(TODAY)!;
const habit = (id: string, scheduledDays?: number[]) =>
  ({ id, name: id, category: 'work', days: [], archived: false, scheduledDays }) as unknown as Habit;
const done = (habitId: string): HabitCompletionEvent =>
  ({ id: `log-${habitId}`, habitId, date: TODAY, dayIndex: dayIndexForIso(TODAY, origin), type: 'full', timestamp: origin.getTime() + 3600_000 }) as HabitCompletionEvent;

const build = (habits: Habit[], completionEvents: HabitCompletionEvent[] = []) =>
  buildWidgetSnapshot({
    todayIso: TODAY,
    origin,
    todayDayIndex: dayIndexForIso(TODAY, origin),
    dark: false,
    momentumScore: 42,
    habits,
    reminders: [],
    momentumEvents: [],
    completionEvents,
  });

describe('buildWidgetSnapshot next-day view', () => {
  it('carries a view of tomorrow, one level deep', () => {
    const snapshot = build([habit('daily')]);
    expect(snapshot.todayIso).toBe(TODAY);
    expect(snapshot.next?.todayIso).toBe('2026-10-19');
    expect(snapshot.next?.next).toBeUndefined();
  });

  it("starts tomorrow with nothing done, even when today's habits are done", () => {
    const snapshot = build([habit('daily')], [done('daily')]);
    expect(snapshot.habitsCompleted).toBe(1);
    expect(snapshot.habits[0].completed).toBe(true);
    expect(snapshot.next?.habitsCompleted).toBe(0);
    expect(snapshot.next?.habits.map((h) => h.completed)).toEqual([false]);
    expect(snapshot.next?.identity.points).toBe(0);
  });

  it("lists tomorrow's habits by tomorrow's weekday", () => {
    // 0 = Monday, 6 = Sunday.
    const snapshot = build([habit('mondays', [0]), habit('sundays', [6])]);
    expect(snapshot.habits.map((h) => h.id)).toEqual(['sundays']);
    expect(snapshot.next?.habits.map((h) => h.id)).toEqual(['mondays']);
    expect(snapshot.next?.totalHabits).toBe(1);
  });

  it('keeps the momentum score and theme for tomorrow', () => {
    const snapshot = build([habit('daily')]);
    expect(snapshot.next?.score).toBe(42);
    expect(snapshot.next?.dark).toBe(false);
    expect(snapshot.next?.sleepRate).toBeNull();
  });
});
