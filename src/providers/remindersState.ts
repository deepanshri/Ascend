/**
 * Pure state transitions for standalone reminders. Each transition returns the
 * next list, the reminder it changed and what should happen to that
 * reminder's native alerts; RemindersProvider applies those side effects.
 */
import type { StandaloneReminder } from '../types';
import { reminderNotificationIds, weekdayFromIsoDate, withReminderNotificationIds } from '../lib/reminderIds';
import { toISODate } from '../utils/dates';

export type NewReminderInput = Omit<StandaloneReminder, 'id' | 'completed' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  notificationId1?: number;
  notificationId2?: number;
};

export type ReminderUpdates = Partial<Omit<StandaloneReminder, 'id' | 'createdAt'>>;

export type AlertAction = 'schedule' | 'cancel';

export interface ReminderChange {
  reminders: StandaloneReminder[];
  /** The reminder as changed, or null when nothing changed. */
  changed: StandaloneReminder | null;
  alert: AlertAction | null;
}

const unchanged = (reminders: StandaloneReminder[]): ReminderChange => ({ reminders, changed: null, alert: null });

function replaceById(
  reminders: StandaloneReminder[],
  id: string,
  revise: (reminder: StandaloneReminder) => StandaloneReminder | null
): { reminders: StandaloneReminder[]; changed: StandaloneReminder | null } {
  const index = reminders.findIndex((reminder) => reminder.id === id);
  if (index < 0) return { reminders, changed: null };
  const changed = revise(reminders[index]);
  if (!changed) return { reminders, changed: null };
  const next = reminders.slice();
  next[index] = changed;
  return { reminders: next, changed };
}

function reminderRevision(item: StandaloneReminder): number {
  return item.updatedAt || item.createdAt || 0;
}

/** Last-write-wins by updatedAt. Equal timestamps keep the local (in-flight) row. */
export function mergeRemindersByUpdatedAt(
  local: StandaloneReminder[],
  incoming: StandaloneReminder[]
): StandaloneReminder[] {
  const merged = new Map<string, StandaloneReminder>();
  incoming.forEach((item) => merged.set(item.id, item));
  local.forEach((item) => {
    const current = merged.get(item.id);
    if (!current || reminderRevision(item) >= reminderRevision(current)) {
      merged.set(item.id, item);
    }
  });
  return Array.from(merged.values());
}

/** Build a new reminder. `idSuffix` makes generated ids unique within one millisecond. */
export function createReminder(input: NewReminderInput, now: number, idSuffix: string): StandaloneReminder {
  const id = input.id || `rem-${now}-${idSuffix}`;
  const ids = reminderNotificationIds(id);
  const hasTime = Boolean(input.time);
  return {
    ...input,
    id,
    completed: false,
    alert10Min: hasTime && input.alert10Min !== false,
    alertExact: hasTime && input.alertExact !== false,
    createdAt: now,
    updatedAt: now,
    habitId: input.habitId ?? null,
    daysOfWeek: input.daysOfWeek?.length ? input.daysOfWeek : [weekdayFromIsoDate(input.date)],
    isEnabled: true,
    notificationId1: Math.trunc(input.notificationId1 ?? ids.notificationId1),
    notificationId2: Math.trunc(input.notificationId2 ?? ids.notificationId2),
  };
}

/** Insert `reminder` at the top, replacing any reminder with the same id. */
export function addReminder(reminders: StandaloneReminder[], reminder: StandaloneReminder): ReminderChange {
  return {
    reminders: [reminder, ...reminders.filter((existing) => existing.id !== reminder.id)],
    changed: reminder,
    alert: 'schedule',
  };
}

export function setReminderCompleted(
  reminders: StandaloneReminder[],
  id: string,
  completed: boolean,
  now: number
): ReminderChange {
  const result = replaceById(reminders, id, (reminder) =>
    reminder.completed === completed
      ? null
      : withReminderNotificationIds({ ...reminder, completed, isEnabled: !completed, updatedAt: now })
  );
  if (!result.changed) return unchanged(reminders);
  return { ...result, alert: completed ? 'cancel' : 'schedule' };
}

export function toggleReminder(reminders: StandaloneReminder[], id: string, now: number): ReminderChange {
  const current = reminders.find((reminder) => reminder.id === id);
  return current ? setReminderCompleted(reminders, id, !current.completed, now) : unchanged(reminders);
}

export function updateReminder(
  reminders: StandaloneReminder[],
  id: string,
  updates: ReminderUpdates,
  now: number
): ReminderChange {
  const result = replaceById(reminders, id, (reminder) =>
    withReminderNotificationIds({ ...reminder, ...updates, updatedAt: now })
  );
  if (!result.changed) return unchanged(reminders);
  const revised = result.changed;
  const alertsOff = revised.alert10Min === false && revised.alertExact === false;
  const silent = revised.completed || revised.isEnabled === false || alertsOff;
  return { ...result, alert: silent ? 'cancel' : 'schedule' };
}

/** Move the reminder `minutes` from `now`, re-enabling it. */
export function snoozeReminder(
  reminders: StandaloneReminder[],
  id: string,
  minutes: number,
  now: number
): ReminderChange {
  const until = new Date(now + minutes * 60 * 1000);
  const date = toISODate(until);
  const result = replaceById(reminders, id, (reminder) =>
    withReminderNotificationIds({
      ...reminder,
      time: until.toTimeString().slice(0, 5),
      date,
      daysOfWeek: [weekdayFromIsoDate(date)],
      isEnabled: true,
      completed: false,
      updatedAt: now,
    })
  );
  return result.changed ? { ...result, alert: 'schedule' } : unchanged(reminders);
}

/**
 * Remove the reminder locally. `changed` is a tombstone (deleted, disabled)
 * that must still be synced so other devices drop it too.
 */
export function deleteReminder(reminders: StandaloneReminder[], id: string, now: number): ReminderChange {
  const current = reminders.find((reminder) => reminder.id === id);
  if (!current) return unchanged(reminders);
  return {
    reminders: reminders.filter((reminder) => reminder.id !== id),
    changed: withReminderNotificationIds({ ...current, deleted: true, isEnabled: false, updatedAt: now }),
    alert: 'cancel',
  };
}

export function countPendingReminders(reminders: StandaloneReminder[]): number {
  return reminders.reduce((count, reminder) => (reminder.completed ? count : count + 1), 0);
}
