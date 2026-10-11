import { describe, expect, it } from 'vitest';
import type { StandaloneReminder } from '../types';
import { reminderNotificationIds } from '../lib/reminderIds';
import { toISODate } from '../utils/dates';
import {
  addReminder,
  countPendingReminders,
  createReminder,
  deleteReminder,
  mergeRemindersByUpdatedAt,
  setReminderCompleted,
  snoozeReminder,
  toggleReminder,
  updateReminder,
} from './remindersState';

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);

const reminder = (fields: Partial<StandaloneReminder> = {}): StandaloneReminder => ({
  id: 'r1',
  title: 'Call',
  date: '2026-10-11',
  time: '09:30',
  completed: false,
  createdAt: 1,
  updatedAt: 1,
  ...fields,
});

describe('createReminder', () => {
  it('fills ids, timestamps, schedule and alerts', () => {
    const created = createReminder({ title: 'Call', date: '2026-10-11', time: '09:30' }, NOW, 'abcd');
    const ids = reminderNotificationIds(`rem-${NOW}-abcd`);
    expect(created).toMatchObject({
      id: `rem-${NOW}-abcd`,
      completed: false,
      alert10Min: true,
      alertExact: true,
      createdAt: NOW,
      updatedAt: NOW,
      habitId: null,
      daysOfWeek: [0],
      isEnabled: true,
      notificationId1: ids.notificationId1,
      notificationId2: ids.notificationId2,
    });
  });

  it('keeps a caller-provided id and turns alerts off without a time', () => {
    const created = createReminder({ id: 'mine', title: 'x', date: '2026-10-11' }, NOW, 'abcd');
    expect(created.id).toBe('mine');
    expect(created.alert10Min).toBe(false);
    expect(created.alertExact).toBe(false);
  });

  it('respects explicitly disabled alerts', () => {
    const created = createReminder({ title: 'x', date: '2026-10-11', time: '09:00', alert10Min: false }, NOW, 'a');
    expect(created.alert10Min).toBe(false);
    expect(created.alertExact).toBe(true);
  });
});

describe('addReminder', () => {
  it('puts the new reminder first and replaces a duplicate id', () => {
    const list = [reminder({ id: 'a' }), reminder({ id: 'b' })];
    const change = addReminder(list, reminder({ id: 'b', title: 'new' }));
    expect(change.reminders.map((r) => [r.id, r.title])).toEqual([
      ['b', 'new'],
      ['a', 'Call'],
    ]);
    expect(change.alert).toBe('schedule');
  });
});

describe('setReminderCompleted / toggleReminder', () => {
  it('completes a reminder, disables it and cancels its alerts', () => {
    const change = setReminderCompleted([reminder()], 'r1', true, NOW);
    expect(change.changed).toMatchObject({ completed: true, isEnabled: false, updatedAt: NOW });
    expect(change.alert).toBe('cancel');
  });

  it('reopens a reminder and schedules its alerts', () => {
    const change = toggleReminder([reminder({ completed: true })], 'r1', NOW);
    expect(change.changed).toMatchObject({ completed: false, isEnabled: true });
    expect(change.alert).toBe('schedule');
  });

  it('is a no-op when the state already matches or the id is unknown', () => {
    const list = [reminder()];
    expect(setReminderCompleted(list, 'r1', false, NOW)).toEqual({ reminders: list, changed: null, alert: null });
    expect(toggleReminder(list, 'missing', NOW).changed).toBeNull();
    expect(toggleReminder(list, 'missing', NOW).reminders).toBe(list);
  });

  it('does not mutate the input list', () => {
    const list = [reminder()];
    setReminderCompleted(list, 'r1', true, NOW);
    expect(list[0].completed).toBe(false);
  });
});

describe('updateReminder', () => {
  it('applies updates and keeps alerts scheduled for an active reminder', () => {
    const change = updateReminder([reminder()], 'r1', { title: 'Renamed' }, NOW);
    expect(change.changed).toMatchObject({ title: 'Renamed', updatedAt: NOW });
    expect(change.alert).toBe('schedule');
  });

  it('cancels alerts when both alerts are turned off', () => {
    expect(updateReminder([reminder()], 'r1', { alert10Min: false, alertExact: false }, NOW).alert).toBe('cancel');
  });

  it('cancels alerts when disabled', () => {
    expect(updateReminder([reminder()], 'r1', { isEnabled: false }, NOW).alert).toBe('cancel');
  });
});

describe('snoozeReminder', () => {
  it('moves the reminder forward and re-enables it', () => {
    const until = new Date(NOW + 15 * 60 * 1000);
    const change = snoozeReminder([reminder({ completed: true })], 'r1', 15, NOW);
    expect(change.changed).toMatchObject({
      time: until.toTimeString().slice(0, 5),
      date: toISODate(until),
      completed: false,
      isEnabled: true,
      updatedAt: NOW,
    });
    expect(change.alert).toBe('schedule');
  });
});

describe('deleteReminder', () => {
  it('removes the reminder and returns a tombstone for sync', () => {
    const change = deleteReminder([reminder({ id: 'a' }), reminder({ id: 'b' })], 'a', NOW);
    expect(change.reminders.map((r) => r.id)).toEqual(['b']);
    expect(change.changed).toMatchObject({ id: 'a', deleted: true, isEnabled: false, updatedAt: NOW });
    expect(change.alert).toBe('cancel');
  });

  it('is a no-op for an unknown id', () => {
    expect(deleteReminder([reminder()], 'missing', NOW).changed).toBeNull();
  });
});

describe('mergeRemindersByUpdatedAt', () => {
  it('keeps the newer copy of each reminder', () => {
    const merged = mergeRemindersByUpdatedAt(
      [reminder({ id: 'a', title: 'local', updatedAt: 5 }), reminder({ id: 'b', title: 'local', updatedAt: 1 })],
      [reminder({ id: 'a', title: 'remote', updatedAt: 3 }), reminder({ id: 'b', title: 'remote', updatedAt: 9 })]
    );
    expect(Object.fromEntries(merged.map((r) => [r.id, r.title]))).toEqual({ a: 'local', b: 'remote' });
  });

  it('keeps the local copy on a tie and includes reminders only one side has', () => {
    const merged = mergeRemindersByUpdatedAt(
      [reminder({ id: 'a', title: 'local', updatedAt: 5 }), reminder({ id: 'l' })],
      [reminder({ id: 'a', title: 'remote', updatedAt: 5 }), reminder({ id: 'r' })]
    );
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'l', 'r']);
    expect(merged.find((r) => r.id === 'a')?.title).toBe('local');
  });
});

describe('countPendingReminders', () => {
  it('counts reminders that are not completed', () => {
    expect(countPendingReminders([reminder(), reminder({ completed: true }), reminder()])).toBe(2);
  });
});
