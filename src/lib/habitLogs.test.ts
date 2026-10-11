import { describe, expect, it } from 'vitest';
import type { HabitCompletionEvent } from '../types';
import { hasLogOn, isLoggedOn } from './habitLogs';

const log = (fields: Record<string, unknown>) =>
  ({ id: 'l', dayIndex: 0, type: 'full', timestamp: 0, ...fields }) as unknown as HabitCompletionEvent;

describe('isLoggedOn', () => {
  it('matches camelCase rows', () => {
    expect(isLoggedOn(log({ habitId: 'h1', date: '2026-10-11' }), 'h1', '2026-10-11')).toBe(true);
  });

  it('matches legacy snake_case rows', () => {
    expect(isLoggedOn(log({ habit_id: 'h1', logged_date: '2026-10-11' }), 'h1', '2026-10-11')).toBe(true);
  });

  it('matches mixed field styles', () => {
    expect(isLoggedOn(log({ habitId: 'h1', logged_date: '2026-10-11' }), 'h1', '2026-10-11')).toBe(true);
  });

  it('requires both the habit and the date to match', () => {
    expect(isLoggedOn(log({ habitId: 'h1', date: '2026-10-10' }), 'h1', '2026-10-11')).toBe(false);
    expect(isLoggedOn(log({ habitId: 'h2', date: '2026-10-11' }), 'h1', '2026-10-11')).toBe(false);
  });
});

describe('hasLogOn', () => {
  const logs = [log({ habitId: 'h1', date: '2026-10-10' }), log({ habit_id: 'h2', logged_date: '2026-10-11' })];

  it('finds a matching row anywhere in the list', () => {
    expect(hasLogOn(logs, 'h2', '2026-10-11')).toBe(true);
  });

  it('is false when nothing matches or the list is empty', () => {
    expect(hasLogOn(logs, 'h1', '2026-10-11')).toBe(false);
    expect(hasLogOn([], 'h1', '2026-10-11')).toBe(false);
  });
});
