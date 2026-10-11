/**
 * Pure helpers that give reminders stable native notification ids and a
 * normalized schedule. Shared by the notification scheduler and the
 * reminders state transitions.
 */
import type { StandaloneReminder } from '../types';

function stableNotificationId(key: string, salt: number): number {
  let hash = salt >>> 0;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  // Stay in 210000–909999 so we never collide with psychology ids 20300 / 81000 / 81300.
  return (210000 + (hash % 700000)) | 0;
}

export function weekdayFromIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  if ([year, month, day].some((value) => Number.isNaN(value))) return new Date().getDay();
  return new Date(year, month - 1, day).getDay();
}

export function reminderNotificationIds(reminderId: string): {
  notificationId1: number;
  notificationId2: number;
} {
  const notificationId1 = stableNotificationId(reminderId, 0x9e3779b1);
  let notificationId2 = stableNotificationId(reminderId, 0x85ebca6b);
  if (notificationId2 === notificationId1) {
    notificationId2 = notificationId1 >= 909999 ? notificationId1 - 1 : notificationId1 + 1;
  }
  return { notificationId1, notificationId2 };
}

export function normalizeTimeHHmm(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const match = String(raw).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function withReminderNotificationIds(reminder: StandaloneReminder): StandaloneReminder {
  const ids = reminderNotificationIds(reminder.id);
  const time = normalizeTimeHHmm(reminder.time);
  return {
    ...reminder,
    time,
    daysOfWeek: reminder.daysOfWeek?.length ? reminder.daysOfWeek : [weekdayFromIsoDate(reminder.date)],
    isEnabled: reminder.isEnabled !== false && !reminder.completed && !reminder.deleted,
    notificationId1: reminder.notificationId1 ?? ids.notificationId1,
    notificationId2: reminder.notificationId2 ?? ids.notificationId2,
  };
}
